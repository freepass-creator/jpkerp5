import {
  get,
  onValue,
  push,
  ref,
  remove,
  set,
  update
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js';
import { db } from './firebase-config.js';
import { buildChatCode, buildLegacyTermCode, buildProductCode, createManagedTermCode, createPartnerCode, createUserCode, sanitizeCodeValue } from './firebase-codes.js';

export async function saveUserProfile(uid, profile) {
  return set(ref(db, `users/${uid}`), {
    ...profile,
    created_at: profile.created_at || Date.now()
  });
}

export async function upsertUserProfile(uid, profile) {
  const userRef = ref(db, `users/${uid}`);
  const snapshot = await get(userRef);
  const current = snapshot.exists() ? snapshot.val() : {};
  return set(userRef, {
    ...current,
    ...profile,
    created_at: current.created_at || Date.now()
  });
}

export async function getUserProfile(uid) {
  const snapshot = await get(ref(db, `users/${uid}`));
  return snapshot.exists() ? snapshot.val() : null;
}

export async function savePartner({ partner_type, business_number = '', partner_name, ceo_name = '', address = '', company_phone = '', email = '', manager_name = '', manager_position = '', manager_phone = '', fax = '', note = '', status = 'active', created_by = '' }) {
  const partnerCode = await createPartnerCode(partner_type);
  const partnerRef = ref(db, `partners/${partnerCode}`);
  const partner = {
    partner_code: partnerCode,
    partner_type,
    business_number,
    partner_name,
    ceo_name,
    address,
    company_phone,
    email,
    manager_name,
    manager_position,
    manager_phone,
    fax,
    note,
    driver_age_lowering,
    annual_mileage,
    status,
    created_by,
    created_at: Date.now()
  };
  await set(partnerRef, partner);
  return partnerCode;
}

export async function updatePartner(partnerCode, updates) {
  const code = sanitizeCodeValue(partnerCode);
  const partnerRef = ref(db, `partners/${code}`);
  const snapshot = await get(partnerRef);
  if (!snapshot.exists()) throw new Error('수정할 파트너가 없습니다.');
  const current = snapshot.val();
  await set(partnerRef, {
    ...current,
    ...updates,
    partner_code: code,
    updated_at: Date.now()
  });
  return code;
}

export async function fetchPartnersOnce() {
  const snapshot = await get(ref(db, 'partners'));
  const data = snapshot.val() || {};
  return Object.values(data)
    .filter((item) => item.status !== 'deleted')
    .sort((a, b) => String(a.partner_code).localeCompare(String(b.partner_code)));
}

export function watchPartners(callback) {
  return onValue(ref(db, 'partners'), (snapshot) => {
    const data = snapshot.val() || {};
    callback(
      Object.values(data)
        .filter((item) => item.status !== 'deleted')
        .sort((a, b) => String(a.partner_code).localeCompare(String(b.partner_code)))
    );
  });
}

export async function getPartnerByCode(partnerCode) {
  const normalized = sanitizeCodeValue(partnerCode);
  const snapshot = await get(ref(db, `partners/${normalized}`));
  return snapshot.exists() ? snapshot.val() : null;
}


export async function getPartnerByBusinessNumber(businessNumber) {
  const normalized = String(businessNumber || '').replace(/[^0-9]/g, '');
  if (!normalized) return null;
  const partners = await fetchPartnersOnce();
  return partners.find((partner) => String(partner.business_number || '').replace(/[^0-9]/g, '') === normalized) || null;
}
export async function updatePartnerStatus(partnerCode, status) {
  return update(ref(db, `partners/${sanitizeCodeValue(partnerCode)}`), {
    status,
    updated_at: Date.now()
  });
}

export async function deletePartner(partnerCode) {
  const code = sanitizeCodeValue(partnerCode);
  return update(ref(db, `partners/${code}`), {
    status: 'deleted',
    deleted_at: Date.now()
  });
}

export async function fetchUsersOnce() {
  const snapshot = await get(ref(db, 'users'));
  const data = snapshot.val() || {};
  return Object.entries(data)
    .map(([uid, value]) => ({ uid, ...value }))
    .filter((user) => user.status !== 'deleted');
}

export function watchUsers(callback) {
  return onValue(ref(db, 'users'), (snapshot) => {
    const data = snapshot.val() || {};
    callback(
      Object.entries(data)
        .map(([uid, value]) => ({ uid, ...value }))
        .filter((user) => user.status !== 'deleted')
    );
  });
}

export async function updateUserStatus(uid, status) {
  return update(ref(db, `users/${uid}`), {
    status,
    updated_at: Date.now()
  });
}

export async function updateUserProfile(uid, updates) {
  const userRef = ref(db, `users/${uid}`);
  const snapshot = await get(userRef);
  if (!snapshot.exists()) throw new Error('수정할 회원이 없습니다.');
  const current = snapshot.val();
  const next = {
    ...current,
    ...updates,
    updated_at: Date.now()
  };

  const nextRole = next.role || '';
  const nextCompanyCode = sanitizeCodeValue(next.company_code || '');
  const shouldAssignUserCode = (!current.user_code || !String(current.user_code).trim()) && next.status === 'active' && nextRole;

  if (shouldAssignUserCode) {
    if (nextRole === 'admin') {
      next.user_code = current.email === 'dudguq@gmail.com' ? 'A0001' : await createUserCode('admin');
      next.admin_code = next.user_code;
      next.company_code = 'MASTER';
      next.company_name = 'FREEPASS';
    } else if (nextRole === 'provider') {
      if (!nextCompanyCode.startsWith('RP')) throw new Error('공급사 회원은 RP 계열 소속코드가 필요합니다.');
      next.user_code = await createUserCode('provider', nextCompanyCode);
      next.company_code = nextCompanyCode;
    } else if (nextRole === 'agent') {
      if (!nextCompanyCode.startsWith('SP')) throw new Error('영업자 회원은 SP 계열 소속코드가 필요합니다.');
      next.user_code = await createUserCode('agent', nextCompanyCode);
      next.company_code = nextCompanyCode;
    }
  }

  await set(userRef, next);
  return uid;
}

export async function deleteUserProfile(uid) {
  return update(ref(db, `users/${uid}`), {
    status: 'deleted',
    deleted_at: Date.now()
  });
}

export function watchCodeSequences(callback) {
  return onValue(ref(db, 'code_sequences'), (snapshot) => {
    callback(snapshot.val() || {});
  });
}

export async function saveCodeItem({ group_code, item_code, item_name, note = '', sort_order = 0, is_active = true, created_by = '' }) {
  const normalizedGroup = sanitizeCodeValue(group_code);
  const normalizedCode = sanitizeCodeValue(item_code);
  if (!normalizedGroup || !normalizedCode) throw new Error('그룹코드와 항목코드는 필수입니다.');
  const codeKey = `${normalizedGroup}_${normalizedCode}`;
  const itemRef = ref(db, `input_codes/${codeKey}`);
  await set(itemRef, {
    code_key: codeKey,
    group_code: normalizedGroup,
    item_code: normalizedCode,
    item_name,
    note,
    sort_order: Number(sort_order || 0),
    is_active: Boolean(is_active),
    created_by,
    created_at: Date.now()
  });
  return codeKey;
}

export async function updateCodeItem(codeKey, updates) {
  const normalizedKey = sanitizeCodeValue(codeKey);
  const itemRef = ref(db, `input_codes/${normalizedKey}`);
  const snapshot = await get(itemRef);
  if (!snapshot.exists()) throw new Error('수정할 코드 항목이 없습니다.');
  const current = snapshot.val();
  await set(itemRef, {
    ...current,
    ...updates,
    code_key: normalizedKey,
    updated_at: Date.now()
  });
  return normalizedKey;
}

export async function deleteCodeItem(codeKey) {
  return remove(ref(db, `input_codes/${sanitizeCodeValue(codeKey)}`));
}

export function watchCodeItems(callback) {
  return onValue(ref(db, 'input_codes'), (snapshot) => {
    const data = snapshot.val() || {};
    const items = Object.values(data).sort((a, b) => {
      const groupCompare = String(a.group_code).localeCompare(String(b.group_code));
      if (groupCompare !== 0) return groupCompare;
      const sortCompare = Number(a.sort_order || 0) - Number(b.sort_order || 0);
      if (sortCompare !== 0) return sortCompare;
      return String(a.item_code).localeCompare(String(b.item_code));
    });
    callback(items);
  });
}

export function watchCodeItemsByGroup(groupCode, callback) {
  const normalizedGroup = sanitizeCodeValue(groupCode);
  return onValue(ref(db, 'input_codes'), (snapshot) => {
    const data = snapshot.val() || {};
    const items = Object.values(data)
      .filter((item) => item.group_code === normalizedGroup && item.is_active !== false)
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
    callback(items);
  });
}

export async function saveTerm({ provider_company_code, term_name, content = '', note = '', status = 'active', created_by = '', driver_age_lowering = '', annual_mileage = '' }) {
  const providerCode = sanitizeCodeValue(provider_company_code);
  const normalizedTermName = String(term_name || '').trim();
  if (!providerCode) throw new Error('공급사코드가 필요합니다.');
  if (!normalizedTermName) throw new Error('정책명은 필수입니다.');
  const termsSnapshot = await get(ref(db, 'terms'));
  const termsData = termsSnapshot.val() || {};
  const duplicatedName = Object.values(termsData).find((item) => item.status !== 'deleted' && item.provider_company_code === providerCode && String(item.term_name || '').trim() === normalizedTermName);
  if (duplicatedName) throw new Error('같은 공급사에서 같은 정책명은 등록할 수 없습니다.');
  const termCode = await createManagedTermCode(providerCode);
  const termRef = ref(db, `terms/${termCode}`);
  await set(termRef, {
    term_code: termCode,
    provider_company_code: providerCode,
    term_name: normalizedTermName,
    content,
    note,
    driver_age_lowering,
    annual_mileage,
    status,
    created_by,
    created_at: Date.now()
  });
  return termCode;
}

export async function updateTerm(termCode, updates) {
  const normalizedCode = sanitizeCodeValue(termCode);
  const termRef = ref(db, `terms/${normalizedCode}`);
  const snapshot = await get(termRef);
  if (!snapshot.exists()) throw new Error('수정할 정책이 없습니다.');
  const current = snapshot.val();
  const nextTermName = String(updates.term_name || current.term_name || '').trim();
  if (!nextTermName) throw new Error('정책명은 필수입니다.');
  const termsSnapshot = await get(ref(db, 'terms'));
  const termsData = termsSnapshot.val() || {};
  const targetProviderCode = sanitizeCodeValue(updates.provider_company_code || current.provider_company_code || '');
  const duplicatedName = Object.entries(termsData).find(([code, item]) => code !== normalizedCode && item.status !== 'deleted' && item.provider_company_code === targetProviderCode && String(item.term_name || '').trim() === nextTermName);
  if (duplicatedName) throw new Error('같은 공급사에서 같은 정책명은 등록할 수 없습니다.');
  await set(termRef, {
    ...current,
    ...updates,
    term_name: nextTermName,
    term_code: normalizedCode,
    updated_at: Date.now()
  });
  return normalizedCode;
}

export async function deleteTerm(termCode) {
  return update(ref(db, `terms/${sanitizeCodeValue(termCode)}`), {
    status: 'deleted',
    deleted_at: Date.now()
  });
}

export function watchTerms(callback) {
  return onValue(ref(db, 'terms'), (snapshot) => {
    const data = snapshot.val() || {};
    const items = Object.values(data)
      .filter((item) => item.status !== 'deleted')
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    callback(items);
  });
}

export function watchTermsByProvider(providerCompanyCode, callback) {
  const normalizedProvider = sanitizeCodeValue(providerCompanyCode);
  return onValue(ref(db, 'terms'), (snapshot) => {
    const data = snapshot.val() || {};
    const items = Object.values(data)
      .filter((item) => item.provider_company_code === normalizedProvider && item.status !== 'inactive' && item.status !== 'deleted')
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    callback(items);
  });
}

export async function getTerm(termCode) {
  const snapshot = await get(ref(db, `terms/${sanitizeCodeValue(termCode)}`));
  return snapshot.exists() ? snapshot.val() : null;
}

export async function saveProduct(product) {
  const productCode = buildProductCode(product.car_number, product.provider_company_code);
  const productRef = ref(db, `products/${productCode}`);
  const snapshot = await get(productRef);
  if (snapshot.exists()) {
    throw new Error('같은 차량번호 상품이 이미 등록되어 있습니다.');
  }
  const allProductsSnapshot = await get(ref(db, 'products'));
  const productsData = allProductsSnapshot.val() || {};
  const normalizedCarNumber = sanitizeCodeValue(product.car_number);
  const duplicatedCar = Object.values(productsData).find((item) => sanitizeCodeValue(item.car_number) === normalizedCarNumber);
  if (duplicatedCar) {
    throw new Error('같은 차량번호는 등록할 수 없습니다.');
  }

  const termCode = product.term_code || buildLegacyTermCode(product.provider_company_code, product.term_name || product.term_type);
  await set(productRef, {
    product_code: productCode,
    term_code: termCode,
    term_name: product.term_name || product.term_type || '',
    ...product,
    created_at: Date.now()
  });
  return productCode;
}

export function watchProducts(callback) {
  return onValue(ref(db, 'products'), (snapshot) => {
    const data = snapshot.val() || {};
    callback(Object.values(data).sort((a, b) => (b.created_at || 0) - (a.created_at || 0)));
  });
}

export async function updateProduct(productCode, updates) {
  const productRef = ref(db, `products/${productCode}`);
  const snapshot = await get(productRef);
  if (!snapshot.exists()) throw new Error('수정할 상품이 없습니다.');
  const current = snapshot.val();
  const nextCarNumber = String(updates.car_number || current.car_number || '').trim();
  const normalizedNextCarNumber = sanitizeCodeValue(nextCarNumber);
  const allProductsSnapshot = await get(ref(db, 'products'));
  const productsData = allProductsSnapshot.val() || {};
  const duplicatedCar = Object.entries(productsData).find(([code, item]) => code !== productCode && sanitizeCodeValue(item.car_number) === normalizedNextCarNumber);
  if (duplicatedCar) {
    throw new Error('같은 차량번호는 등록할 수 없습니다.');
  }
  const next = {
    ...current,
    ...updates,
    car_number: nextCarNumber,
    product_code: productCode,
    term_code: updates.term_code || current.term_code || buildLegacyTermCode(current.provider_company_code, updates.term_name || current.term_name || current.term_type),
    term_name: updates.term_name || current.term_name || current.term_type || '',
    updated_at: Date.now()
  };
  await set(productRef, next);
  return productCode;
}

export async function deleteProduct(productCode) {
  return remove(ref(db, `products/${sanitizeCodeValue(productCode)}`));
}

export async function getProduct(productCode) {
  const snapshot = await get(ref(db, `products/${productCode}`));
  return snapshot.exists() ? snapshot.val() : null;
}

export async function ensureRoom({
  productCode,
  providerUid,
  providerCompanyCode,
  providerName = '',
  agentUid,
  agentCode,
  agentName = '',
  vehicleNumber = '',
  modelName = ''
}) {
  const chatCode = buildChatCode(productCode, agentCode, agentUid);
  const roomId = chatCode;
  const roomRef = ref(db, `rooms/${roomId}`);
  const snapshot = await get(roomRef);
  const now = Date.now();
  const basePayload = {
    room_id: roomId,
    chat_code: chatCode,
    product_code: productCode,
    provider_uid: providerUid || '',
    provider_company_code: providerCompanyCode || '',
    provider_name: providerName || '',
    agent_uid: agentUid || '',
    agent_code: agentCode || '',
    agent_name: agentName || '',
    vehicle_number: vehicleNumber || '',
    model_name: modelName || '',
    last_message: '',
    last_message_at: 0,
    last_sender_role: '',
    last_sender_code: '',
    last_effective_sender_role: '',
    last_effective_sender_code: '',
    unread_for_agent: 0,
    unread_for_provider: 0,
    created_at: now,
    updated_at: now
  };

  if (!snapshot.exists()) {
    await set(roomRef, basePayload);
  } else {
    const current = snapshot.val() || {};
    await update(roomRef, {
      provider_uid: providerUid || current.provider_uid || '',
      provider_company_code: providerCompanyCode || current.provider_company_code || '',
      provider_name: providerName || current.provider_name || '',
      agent_uid: agentUid || current.agent_uid || '',
      agent_code: agentCode || current.agent_code || '',
      agent_name: agentName || current.agent_name || '',
      vehicle_number: vehicleNumber || current.vehicle_number || '',
      model_name: modelName || current.model_name || '',
      last_effective_sender_role: current.last_effective_sender_role || (current.last_sender_role === 'admin' ? '' : (current.last_sender_role || '')),
      last_effective_sender_code: current.last_effective_sender_code || (current.last_sender_role === 'admin' ? '' : (current.last_sender_code || '')),
      updated_at: now
    });
  }
  return roomId;
}

export function watchRooms(callback) {
  return onValue(ref(db, 'rooms'), (snapshot) => {
    const data = snapshot.val() || {};
    callback(Object.values(data).sort((a, b) => (b.last_message_at || 0) - (a.last_message_at || 0)));
  });
}

export function watchMessages(roomId, callback) {
  return onValue(ref(db, `messages/${roomId}`), (snapshot) => {
    const data = snapshot.val() || {};
    callback(Object.entries(data).map(([id, value]) => ({ id, ...value })));
  });
}

export async function markRoomRead(roomId, role) {
  const roomRef = ref(db, `rooms/${roomId}`);
  if (role === 'agent') {
    await update(roomRef, { unread_for_agent: 0, updated_at: Date.now() });
  } else if (role === 'provider') {
    await update(roomRef, { unread_for_provider: 0, updated_at: Date.now() });
  }
}

export async function sendMessage(roomId, payload) {
  const now = Date.now();
  const roomRef = ref(db, `rooms/${roomId}`);
  const roomSnapshot = await get(roomRef);
  const currentRoom = roomSnapshot.exists() ? roomSnapshot.val() : {};

  const messageRef = push(ref(db, `messages/${roomId}`));
  await set(messageRef, {
    ...payload,
    created_at: now
  });

  const unreadForAgent = Number(currentRoom.unread_for_agent || 0);
  const unreadForProvider = Number(currentRoom.unread_for_provider || 0);
  const senderRole = payload.sender_role || '';

  let nextUnreadForAgent = unreadForAgent;
  let nextUnreadForProvider = unreadForProvider;

  if (senderRole === 'agent') {
    nextUnreadForAgent = 0;
    nextUnreadForProvider = unreadForProvider + 1;
  } else if (senderRole === 'provider') {
    nextUnreadForAgent = unreadForAgent + 1;
    nextUnreadForProvider = 0;
  }

  const currentHiddenBy = { ...(currentRoom.hidden_by || {}) };
  const senderUid = payload.sender_uid || '';
  if (senderUid && currentHiddenBy[senderUid]) delete currentHiddenBy[senderUid];
  const agentUid = currentRoom.agent_uid || '';
  const providerUid = currentRoom.provider_uid || '';
  if (agentUid && currentHiddenBy[agentUid]) delete currentHiddenBy[agentUid];
  if (providerUid && currentHiddenBy[providerUid]) delete currentHiddenBy[providerUid];

  const updatePayload = {
    last_message: payload.text,
    last_message_at: now,
    last_sender_role: senderRole,
    last_sender_code: payload.sender_code || '',
    unread_for_agent: nextUnreadForAgent,
    unread_for_provider: nextUnreadForProvider,
    hidden_by: currentHiddenBy,
    updated_at: now
  };

  if (senderRole === 'agent' || senderRole === 'provider') {
    updatePayload.last_effective_sender_role = senderRole;
    updatePayload.last_effective_sender_code = payload.sender_code || '';
  }

  await update(roomRef, updatePayload);
}

export function watchGeneratedCodes(callback) {
  return onValue(ref(db), (snapshot) => {
    const rootData = snapshot.val() || {};
    const items = [];

    const partners = Object.values(rootData.partners || {});
    partners.forEach((partner) => {
      items.push({
        code_type: 'partner',
        code: partner.partner_code || '',
        title: partner.partner_name || '-',
        subtitle: partner.partner_type === 'provider' ? '공급사 코드' : '영업채널 코드',
        rule_text: partner.partner_type === 'provider' ? 'RP + 4자리 시퀀스' : 'SP + 3자리 시퀀스',
        source_values: { partner_type: partner.partner_type || '', partner_name: partner.partner_name || '' },
        created_at: partner.created_at || 0
      });
    });

    const users = Object.values(rootData.users || {});
    users.forEach((user) => {
      if (!user.user_code) return;
      let rule = '사용자 역할 기반 자동 시퀀스';
      if (user.role === 'provider') rule = 'R + 4자리 시퀀스';
      else if (user.role === 'agent') rule = 'S + 3자리 시퀀스';
      else if (user.role === 'admin') rule = 'A0001 고정';
      items.push({
        code_type: 'user',
        code: user.user_code,
        title: user.name || user.email || '-',
        subtitle: '사용자 코드',
        rule_text: rule,
        source_values: { role: user.role || '', partner_code: user.company_code || '', email: user.email || '' },
        created_at: user.created_at || 0
      });
    });

    const terms = Object.values(rootData.terms || {});
    terms.forEach((term) => {
      items.push({
        code_type: 'policy',
        code: term.term_code || '',
        title: term.term_name || '-',
        subtitle: '정책 코드',
        rule_text: '공급사코드 + T + 3자리 시퀀스',
        source_values: { provider_company_code: term.provider_company_code || '', term_name: term.term_name || '' },
        created_at: term.created_at || 0
      });
    });

    const products = Object.values(rootData.products || {});
    products.forEach((product) => {
      items.push({
        code_type: 'product',
        code: product.product_code || '',
        title: product.car_number || '-',
        subtitle: '상품 코드',
        rule_text: '차량번호 + 공급사코드',
        source_values: { car_number: product.car_number || '', provider_company_code: product.provider_company_code || '' },
        created_at: product.created_at || 0
      });
    });

    const rooms = Object.values(rootData.rooms || {});
    rooms.forEach((room) => {
      items.push({
        code_type: 'chat',
        code: room.chat_code || room.room_id || '',
        title: room.product_code || '-',
        subtitle: '대화 코드',
        rule_text: 'CH + 상품코드 + 영업자코드',
        source_values: { product_code: room.product_code || '', agent_code: room.agent_code || '' },
        created_at: room.created_at || 0
      });
    });

    items.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    callback(items);
  });
}


export async function saveContract(contract) {
  const partnerCode = sanitizeCodeValue(contract.partner_code || contract.provider_company_code || '');
  if (!partnerCode) throw new Error('파트너코드가 필요합니다.');
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dateKey = `${yy}${mm}${dd}`;
  const prefix = `CT-${dateKey}-${partnerCode}`;

  const snapshot = await get(ref(db, 'contracts'));
  const data = snapshot.val() || {};
  const existingCodes = Object.keys(data).filter((code) => String(code).startsWith(prefix));
  const nextSeq = String(existingCodes.length + 1).padStart(3, '0');
  const contractCode = `${prefix}-${nextSeq}`;

  const payload = {
    contract_code: contractCode,
    contract_date: `${now.getFullYear()}-${mm}-${dd}`,
    contract_status: '계약대기',
    customer_name: '',
    customer_birth: '',
    customer_phone: '',
    docs: [],
    checks: {
      deposit_confirmed: false,
      docs_confirmed: false,
      contract_signed: false,
      final_payment: false,
      vehicle_delivered: false
    },
    ...contract,
    contract_code: contractCode,
    partner_code: partnerCode,
    provider_company_code: partnerCode,
    created_at: Date.now()
  };

  await set(ref(db, `contracts/${contractCode}`), payload);
  return contractCode;
}

export async function updateContract(contractCode, updates) {
  const code = sanitizeCodeValue(contractCode);
  const contractRef = ref(db, `contracts/${code}`);
  const snapshot = await get(contractRef);
  if (!snapshot.exists()) throw new Error('수정할 계약이 없습니다.');
  const current = snapshot.val() || {};
  const next = {
    ...current,
    ...updates,
    contract_code: code,
    updated_at: Date.now()
  };
  await set(contractRef, next);
  if (next.contract_status === '계약완료') {
    await set(ref(db, `settlements/${code}`), {
      settlement_code: code,
      contract_code: code,
      partner_code: next.partner_code || '',
      agent_uid: next.agent_uid || '',
      customer_name: next.customer_name || '',
      car_number: next.car_number || '',
      vehicle_name: next.vehicle_name || '',
      rent_month: next.rent_month || '48',
      rent_amount: Number(next.rent_amount || 0),
      deposit_amount: Number(next.deposit_amount || 0),
      created_at: next.created_at || Date.now(),
      completed_at: Date.now(),
      status: '정산대기'
    });
  }
  return code;
}

export async function deleteContract(contractCode) {
  return remove(ref(db, `contracts/${sanitizeCodeValue(contractCode)}`));
}

export function watchContracts(callback) {
  return onValue(ref(db, 'contracts'), (snapshot) => {
    const data = snapshot.val() || {};
    callback(Object.values(data).sort((a, b) => (b.created_at || 0) - (a.created_at || 0)));
  });
}


export async function hideRoomForUser(roomId, userUid) {
  const safeRoomId = sanitizeCodeValue(roomId);
  const safeUserUid = sanitizeCodeValue(userUid);
  if (!safeRoomId || !safeUserUid) throw new Error('숨김 처리 정보가 올바르지 않습니다.');
  const roomRef = ref(db, `rooms/${safeRoomId}`);
  const snapshot = await get(roomRef);
  if (!snapshot.exists()) throw new Error('숨길 대화방이 없습니다.');
  const current = snapshot.val() || {};
  const hiddenBy = { ...(current.hidden_by || {}), [safeUserUid]: true };
  await update(roomRef, { hidden_by: hiddenBy, updated_at: Date.now() });
}

export async function deleteRoomEverywhere(roomId) {
  const safeRoomId = sanitizeCodeValue(roomId);
  if (!safeRoomId) throw new Error('삭제할 대화방 코드가 올바르지 않습니다.');
  await remove(ref(db, `messages/${safeRoomId}`));
  await remove(ref(db, `rooms/${safeRoomId}`));
}
