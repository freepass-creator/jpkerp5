import { requireAuth } from '../core/auth-guard.js';
import { formatMoney, qs, registerPageCleanup } from '../core/utils.js';
import { renderRoleMenu } from '../core/role-menu.js';
import { deleteRoomEverywhere, ensureRoom, hideRoomForUser, markRoomRead, sendMessage, watchMessages, watchProducts, watchRooms } from '../firebase/firebase-db.js';

const menu = qs('#sidebar-menu');
const roomList = qs('#room-list');
const messageList = qs('#message-list');
const messageForm = qs('#message-form');
const messageInput = qs('#message-input');
const chatCode = qs('#chat-code');
const feedback = qs('#chat-message');
const detailCard = qs('#chat-product-detail-card');
const filterToggleButton = qs('#openChatFilterBtn');
const filterOverlay = qs('#chatFilterOverlay');
const hideRoomBtn = qs('#hideRoomBtn');
const deleteRoomBtn = qs('#deleteRoomBtn');

const params = new URLSearchParams(window.location.search);
const preferredRoomId = params.get('room_id');
const preferredProductCode = params.get('product_code');

let currentRoomId = preferredRoomId || null;
let currentProfile = null;
let currentUser = null;
let productsMap = new Map();
let roomMap = new Map();
let unsubscribeMessages = null;
let openedRoomId = null;
let visibleRoomsCache = [];

function formatTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function truncate(text = '', max = 26) {
  const source = String(text || '').trim();
  if (!source) return '-';
  return source.length > max ? `${source.slice(0, max)}...` : source;
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getStatusLabel(room) {
  if (!room) return '-';
  const lastAgent = room.last_agent_message_at ? new Date(room.last_agent_message_at).getTime() : 0;
  const providerRead = room.provider_last_read_at ? new Date(room.provider_last_read_at).getTime() : 0;
  const lastProvider = room.last_provider_message_at ? new Date(room.last_provider_message_at).getTime() : 0;

  if (lastAgent && providerRead < lastAgent) return '미확인';
  if (lastAgent && providerRead >= lastAgent && lastProvider < lastAgent) return '응답대기';
  return '응답완료';
}


function getStatusClass(label) {
  if (label === '미확인') return 'is-unread';
  if (label === '응답대기') return 'is-pending';
  return 'is-done';
}

function renderDetail(product) {
  if (!product) {
    detailCard.innerHTML = '<div class="empty-block">상품을 선택하세요.</div>';
    return;
  }

  detailCard.innerHTML = `
    <div class="detail-row"><div class="detail-label">상품코드</div><div class="detail-value">${product.product_code}</div></div>
    <div class="detail-row"><div class="detail-label">차량번호</div><div class="detail-value">${product.car_number}</div></div>
    <div class="detail-row"><div class="detail-label">정책코드</div><div class="detail-value">${product.term_code || '-'}</div></div>
    <div class="detail-row"><div class="detail-label">세부모델</div><div class="detail-value">${product.trim_name}</div></div>
    <div class="detail-row"><div class="detail-label">연료</div><div class="detail-value">${product.fuel_type}</div></div>
    <div class="detail-row"><div class="detail-label">48개월</div><div class="detail-value">대여료 ${formatMoney(product.rental_price_48 ?? product.rental_price)} / 보증금 ${formatMoney(product.deposit_48 ?? product.deposit)}</div></div>
    <div class="detail-row"><div class="detail-label">60개월</div><div class="detail-value">대여료 ${formatMoney(product.rental_price_60)} / 보증금 ${formatMoney(product.deposit_60)}</div></div>
  `;
}

function renderMessages(messages) {
  if (!messages.length) {
    messageList.innerHTML = '<div class="empty-block">아직 메시지가 없습니다.</div>';
    return;
  }
  messageList.innerHTML = messages.sort((a, b) => a.created_at - b.created_at).map((message) => {
    const own = message.sender_uid === currentUser.uid ? 'out' : 'in';
    const roleClass = `role-${message.sender_role || 'etc'}`;
    return `
      <div class="message-wrap ${own}">
        <div class="message-meta-line">
          <span class="sender-code">${escapeHtml(message.sender_code || '-')}</span>
          <span class="sender-time">${formatTime(message.created_at)}</span>
        </div>
        <div class="message-item ${roleClass}">
          <div class="message-text">${escapeHtml(message.text || '')}</div>
        </div>
      </div>
    `;
  }).join('');
  messageList.scrollTop = messageList.scrollHeight;
}

async function openRoom(room) {
  if (!room) return;
  currentRoomId = room.room_id;
  openedRoomId = room.room_id;
  chatCode.textContent = room.chat_code || room.room_id;
  renderDetail(productsMap.get(room.product_code));
  roomList.querySelectorAll('.room-item').forEach((element) => {
    element.classList.toggle('active', element.dataset.roomId === room.room_id);
  });

  await markRoomRead(room.room_id, currentProfile.role);
  feedback.textContent = '';

  unsubscribeMessages?.();
  const stopWatch = watchMessages(room.room_id, (messages) => {
    renderMessages(messages);
  });
  unsubscribeMessages = stopWatch;
  registerPageCleanup(() => unsubscribeMessages?.());
}


function applyChatHeadActions() {
  if (!currentProfile) return;
  if (currentProfile.role === 'agent') {
    if (deleteRoomBtn) deleteRoomBtn.style.display = 'none';
    if (hideRoomBtn) hideRoomBtn.style.display = '';
  } else if (currentProfile.role === 'provider' || currentProfile.role === 'admin') {
    if (deleteRoomBtn) deleteRoomBtn.style.display = '';
    if (hideRoomBtn) hideRoomBtn.style.display = '';
  } else {
    if (deleteRoomBtn) deleteRoomBtn.style.display = 'none';
    if (hideRoomBtn) hideRoomBtn.style.display = 'none';
  }
}

async function moveToNextRoomAfterRemoval() {
  const nextRoom = visibleRoomsCache.find((room) => room.room_id !== currentRoomId) || null;
  if (nextRoom) {
    await openRoom(nextRoom);
  } else {
    currentRoomId = null;
    openedRoomId = null;
    chatCode.textContent = '대화코드 없음';
    messageList.innerHTML = '<div class="empty-block">대화방이 없습니다.</div>';
    renderDetail(null);
  }
}

function buildRoomRow(room) {
  const statusLabel = getStatusLabel(room);
  const statusClass = getStatusClass(statusLabel);
  const vehicleNumber = room.vehicle_number || room.product_code || '-';
  const modelName = room.model_name || productsMap.get(room.product_code)?.trim_name || '-';
  const codePair = `${room.agent_code || '-'} / ${room.provider_company_code || '-'}`;
  const row = document.createElement('button');
  row.className = `room-item ${room.room_id === currentRoomId ? 'active' : ''}`;
  row.dataset.roomId = room.room_id;
  row.innerHTML = `
    <span class="chat-badge ${statusClass}">${statusLabel}</span>
    <span class="room-vehicle">${escapeHtml(vehicleNumber)}</span>
    <span class="room-model">${escapeHtml(modelName)}</span>
    <span class="room-codes">${escapeHtml(codePair)}</span>
    <span class="room-last">${escapeHtml(truncate(room.last_message || '대화 시작 전', 26))}</span>
    <span class="room-time">${formatTime(room.last_message_at || room.created_at)}</span>
  `;
  row.addEventListener('click', () => openRoom(room));
  return row;
}

async function bootstrap() {
  try {
    const { user, profile } = await requireAuth({ roles: ['provider', 'agent', 'admin'] });
    currentProfile = profile;
    currentUser = user;
    renderRoleMenu(menu, profile.role);
    filterToggleButton?.addEventListener('click', () => {
      const isOpen = filterOverlay?.classList.contains('is-open');
      filterOverlay?.classList.toggle('is-open', !isOpen);
      filterOverlay?.setAttribute('aria-hidden', String(isOpen));
    });
    applyChatHeadActions();

    registerPageCleanup(watchProducts((products) => {
      productsMap = new Map(products.map((item) => [item.product_code, item]));
      if (profile.role === 'agent' && preferredProductCode && !currentRoomId) {
        const product = productsMap.get(preferredProductCode);
        if (product) {
          ensureRoom({
            productCode: preferredProductCode,
            providerUid: product.provider_uid,
            providerCompanyCode: product.provider_company_code,
            providerName: product.provider_name || '',
            agentUid: user.uid,
            agentCode: profile.user_code,
            agentName: profile.name || '',
            vehicleNumber: product.car_number,
            modelName: product.trim_name
          }).then((roomId) => {
            currentRoomId = roomId;
          });
        }
      }
      if (currentRoomId && roomMap.has(currentRoomId)) {
        renderDetail(productsMap.get(roomMap.get(currentRoomId).product_code));
      }
    }));

    registerPageCleanup(watchRooms((rooms) => {
      const visibleRooms = rooms.filter((room) => {
        const hiddenBy = room.hidden_by || {};
        const isHiddenForMe = !!hiddenBy[user.uid];
        if (isHiddenForMe) return false;
        if (profile.role === 'agent') return room.agent_uid === user.uid || room.agent_code === profile.user_code;
        if (profile.role === 'provider') return room.provider_company_code === profile.company_code;
        return true;
      });

      visibleRoomsCache = visibleRooms;
      roomMap = new Map(visibleRooms.map((room) => [room.room_id, room]));
      roomList.innerHTML = '';
      if (!visibleRooms.length) {
        roomList.innerHTML = '<div class="empty-block">대화방이 없습니다.</div>';
        renderDetail(null);
      } else {
        visibleRooms.forEach((room) => roomList.appendChild(buildRoomRow(room)));
        if (currentRoomId && roomMap.has(currentRoomId)) {
          const currentRoom = roomMap.get(currentRoomId);
          chatCode.textContent = currentRoom.chat_code || currentRoom.room_id;
          renderDetail(productsMap.get(currentRoom.product_code));
          roomList.querySelectorAll('.room-item').forEach((element) => {
            element.classList.toggle('active', element.dataset.roomId === currentRoomId);
          });
          if (openedRoomId !== currentRoomId) {
            openRoom(currentRoom);
          }
        } else if (visibleRooms[0]) {
          openRoom(visibleRooms[0]);
        }
      }
    }));

    hideRoomBtn?.addEventListener('click', async () => {
      if (!currentRoomId) {
        feedback.textContent = '먼저 대화방을 선택하세요.';
        return;
      }
      try {
        await hideRoomForUser(currentRoomId, user.uid);
        feedback.textContent = '선택한 대화를 목록에서 숨겼습니다.';
        await moveToNextRoomAfterRemoval();
      } catch (error) {
        feedback.textContent = `숨김 실패: ${error.message}`;
      }
    });

    deleteRoomBtn?.addEventListener('click', async () => {
      if (!currentRoomId) {
        feedback.textContent = '먼저 대화방을 선택하세요.';
        return;
      }
      if (!window.confirm('이 대화를 완전히 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
      try {
        const removingRoomId = currentRoomId;
        await deleteRoomEverywhere(removingRoomId);
        feedback.textContent = '선택한 대화를 삭제했습니다.';
        currentRoomId = null;
        openedRoomId = null;
      } catch (error) {
        feedback.textContent = `삭제 실패: ${error.message}`;
      }
    });

    messageForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!currentRoomId) {
        feedback.textContent = '먼저 대화방을 선택하세요.';
        return;
      }
      const text = messageInput.value.trim();
      if (!text) return;
      await sendMessage(currentRoomId, {
        sender_uid: user.uid,
        sender_code: profile.user_code || profile.company_code || '-',
        sender_role: profile.role,
        sender_partner_code: profile.company_code || '',
        text
      });
      messageInput.value = '';
      feedback.textContent = '';
    });
  } catch (error) {
    console.error(error);
  }
}

bootstrap();
