import { requireAuth } from '../core/auth-guard.js';
import { updateDetailPanelTitle } from '../core/management-skeleton.js';
import { qs, roleLabel, registerPageCleanup } from '../core/utils.js';
import { renderRoleMenu } from '../core/role-menu.js';
import { deleteUserProfile, fetchPartnersOnce, fetchUsersOnce, updateUserProfile, watchUsers } from '../firebase/firebase-db.js';

const menu = qs('#sidebar-menu');
const form = qs('#member-form');
const message = qs('#member-message');
const filterToggleButton = qs('#openMemberFilterBtn');
const filterOverlay = qs('#memberFilterOverlay');
const list = qs('#member-list');
const editingUidInput = qs('#editing_member_uid');
const refreshButton = qs('#member-refresh');
const submitButton = qs('#member-submit-head');
const deleteButton = qs('#member-delete-head');
const roleSelect = qs('#member_role_select');
const companyCodeSelect = qs('#member_company_code_select');

let currentMembers = [];
let currentPartners = [];
let selectedUid = '';
let formMode = 'view';

function statusLabel(status) {
  if (status === 'active') return '승인';
  if (status === 'rejected') return '반려';
  return '대기';
}

function roleOptionLabel(role) {
  if (role === 'admin') return '관리자';
  if (role === 'provider') return '공급사';
  if (role === 'agent') return '영업자';
  return '미지정';
}

function badgeRoleLabel(role) {
  if (role === 'admin') return '관리자';
  if (role === 'provider') return '공급사';
  if (role === 'agent') return '영업자';
  return '미지정';
}

function buildCompanyCodeOptions(role, selectedCode = '') {
  const items = currentPartners.filter((partner) => {
    if (partner.status === 'deleted' || partner.status === 'inactive') return false;
    if (role === 'provider') return partner.partner_type === 'provider';
    if (role === 'agent') return partner.partner_type === 'sales_channel';
    return false;
  });

  const options = ['<option value="">선택</option>'];
  if (role === 'admin') {
    options.push('<option value="MASTER">MASTER</option>');
  }
  items.forEach((partner) => {
    const selected = selectedCode === partner.partner_code ? 'selected' : '';
    options.push(`<option value="${partner.partner_code}" ${selected}>${partner.partner_code} / ${partner.partner_name}</option>`);
  });
  companyCodeSelect.innerHTML = options.join('');
  if (role === 'admin' && selectedCode === 'MASTER') companyCodeSelect.value = 'MASTER';
}

function syncCompanyName(code) {
  if (code === 'MASTER') {
    qs('#member_company_name').value = 'FREEPASS';
    return;
  }
  const partner = currentPartners.find((item) => item.partner_code === code);
  qs('#member_company_name').value = partner?.partner_name || '';
}

function applyMode(mode) {
  formMode = mode;
  const viewMode = mode === 'view';
  form.classList.toggle('is-view-mode', viewMode);

  form.querySelectorAll('input, select, textarea').forEach((field) => {
    const alwaysLocked = ['editing_member_uid', 'member_user_code', 'member_email', 'member_business_number', 'member_match_result', 'member_company_name'];
    if (alwaysLocked.includes(field.id)) {
      field.disabled = false;
      if (field.tagName === 'INPUT' || field.tagName === 'TEXTAREA') field.readOnly = true;
      if (viewMode) {
        field.tabIndex = -1;
        field.blur();
      } else {
        field.removeAttribute('tabindex');
      }
      return;
    }

    field.disabled = false;
    if (field.tagName === 'INPUT' || field.tagName === 'TEXTAREA') field.readOnly = false;

    if (viewMode) {
      field.tabIndex = -1;
      field.blur();
    } else {
      field.removeAttribute('tabindex');
    }
  });

  updateDetailPanelTitle(form, '회원', viewMode ? 'view' : 'edit');

  if (!selectedUid) {
    form.classList.remove('is-view-mode');
    submitButton.textContent = '수정';
    submitButton.disabled = true;
    deleteButton.disabled = true;
    return;
  }

  if (viewMode) {
    submitButton.textContent = '수정';
    submitButton.disabled = false;
    deleteButton.disabled = false;
  } else {
    submitButton.textContent = '저장';
    submitButton.disabled = false;
    deleteButton.disabled = false;
  }
}

function clearForm() {
  editingUidInput.value = '';
  selectedUid = '';
  form.reset();
  qs('#member_user_code').value = '';
  qs('#member_email').value = '';
  qs('#member_name').value = '';
  qs('#member_business_number').value = '';
  qs('#member_match_result').value = '매칭되는 코드 없음';
  qs('#member_company_name').value = '';
  roleSelect.value = '';
  buildCompanyCodeOptions('', '');
  applyMode('view');
  renderList(currentMembers);
}

function fillForm(member) {
  editingUidInput.value = member.uid;
  selectedUid = member.uid;
  qs('#member_user_code').value = member.user_code || member.admin_code || '-';
  qs('#member_email').value = member.email || '';
  qs('#member_name').value = member.name || '';
  qs('#member_business_number').value = member.business_number || '';
  qs('#member_match_result').value = member.matched_partner_code ? `${member.matched_partner_code} / ${member.matched_partner_name || ''}` : '매칭되는 코드 없음';
  roleSelect.value = member.role || '';
  buildCompanyCodeOptions(member.role || '', member.company_code || '');
  syncCompanyName(member.company_code || '');
  qs('#member_status').value = member.status || 'pending';
  qs('#member_position').value = member.position || '';
  qs('#member_phone').value = member.phone || '';
  qs('#member_note').value = member.note || '';
  applyMode('view');
  renderList(currentMembers);
}

function renderList(members) {
  const visibleMembers = members.filter((member) => member.email !== 'dudguq@gmail.com');
  if (!visibleMembers.length) {
    list.innerHTML = '<div class="empty-block list-empty">등록된 회원이 없습니다.</div>';
    return;
  }
  list.innerHTML = visibleMembers.map((member) => {
    const code = member.company_code || '매칭없음';
    const status = statusLabel(member.status);
    const role = badgeRoleLabel(member.role);
    return `
      <button type="button" class="summary-row admin-summary-row management-summary-row ${selectedUid === member.uid ? 'is-selected' : ''}" data-uid="${member.uid}">
        <span class="summary-inline summary-inline-strong">[${status}]</span>
        <span class="summary-inline summary-inline-strong">[${role}]</span>
        <span class="summary-inline">${member.name || '-'}</span>
        <span class="summary-inline">${member.email || '-'}</span>
        <span class="summary-inline">${code}</span>
      </button>
    `;
  }).join('');
  list.querySelectorAll('.summary-row').forEach((row) => row.addEventListener('click', () => {
    const selected = visibleMembers.find((item) => item.uid === row.dataset.uid);
    if (selected) fillForm(selected);
  }));
}

async function refreshMembers() {
  currentPartners = await fetchPartnersOnce();
  currentMembers = await fetchUsersOnce();
  renderList(currentMembers);
  message.textContent = '회원목록을 새로고침했습니다.';
}

async function handleSave() {
  const editingUid = editingUidInput.value.trim();
  if (!editingUid) {
    message.textContent = '수정할 회원을 먼저 선택하세요.';
    return;
  }
  const role = roleSelect.value;
  const companyCode = companyCodeSelect.value;
  if (!role) throw new Error('회원유형을 선택하세요.');
  if (!companyCode && role !== 'admin') throw new Error('소속코드를 선택하세요.');

  const selectedPartner = currentPartners.find((item) => item.partner_code === companyCode);
  const payload = {
    name: qs('#member_name').value.trim(),
    position: qs('#member_position').value.trim(),
    phone: qs('#member_phone').value.trim(),
    note: qs('#member_note').value.trim(),
    role,
    company_code: role === 'admin' ? 'MASTER' : companyCode,
    company_name: qs('#member_company_name').value.trim() || (role === 'admin' ? 'FREEPASS' : ''),
    matched_partner_code: role === 'admin' ? 'MASTER' : companyCode,
    matched_partner_name: role === 'admin' ? 'FREEPASS' : (selectedPartner?.partner_name || ''),
    matched_partner_type: role === 'provider' ? 'provider' : role === 'agent' ? 'sales_channel' : 'admin',
    match_status: role === 'admin' ? 'matched' : (selectedPartner ? 'matched' : 'unmatched'),
    status: qs('#member_status').value
  };

  await updateUserProfile(editingUid, payload);
  const refreshed = await fetchUsersOnce();
  currentMembers = refreshed;
  const selected = refreshed.find((item) => item.uid === editingUid);
  if (selected) fillForm(selected);
  applyMode('view');
  message.textContent = `수정 완료: ${editingUid}`;
}

async function handleDelete() {
  const editingUid = editingUidInput.value.trim();
  if (!editingUid) {
    message.textContent = '삭제할 회원을 먼저 선택하세요.';
    return;
  }
  if (!window.confirm('선택한 회원을 삭제 처리할까요?')) return;
  await deleteUserProfile(editingUid);
  message.textContent = `삭제 완료: ${editingUid}`;
  clearForm();
}

roleSelect?.addEventListener('change', () => {
  buildCompanyCodeOptions(roleSelect.value, roleSelect.value === 'admin' ? 'MASTER' : '');
  syncCompanyName(companyCodeSelect.value);
});
companyCodeSelect?.addEventListener('change', () => syncCompanyName(companyCodeSelect.value));
refreshButton?.addEventListener('click', async () => {
  try { await refreshMembers(); } catch (error) { message.textContent = `새로고침 실패: ${error.message}`; }
});
submitButton?.addEventListener('click', async () => {
  try {
    if (!selectedUid) return;
    if (formMode === 'view') {
      applyMode('edit');
      return;
    }
    await handleSave();
  } catch (error) {
    message.textContent = `저장 실패: ${error.message}`;
  }
});
deleteButton?.addEventListener('click', async () => {
  try { await handleDelete(); } catch (error) { message.textContent = `삭제 실패: ${error.message}`; }
});

async function bootstrap() {
  try {
    const { profile } = await requireAuth({ roles: ['admin'] });
    renderRoleMenu(menu, profile.role);
    filterToggleButton?.addEventListener('click', () => {
      const isOpen = filterOverlay?.classList.contains('is-open');
      filterOverlay?.classList.toggle('is-open', !isOpen);
      filterOverlay?.setAttribute('aria-hidden', String(isOpen));
    });
    currentPartners = await fetchPartnersOnce();
    registerPageCleanup(watchUsers((users) => {
      currentMembers = users;
      renderList(currentMembers);
    }));
    clearForm();
  } catch (error) {
    console.error(error);
  }
}

bootstrap();
