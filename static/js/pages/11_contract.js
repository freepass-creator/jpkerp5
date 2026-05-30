
import { requireAuth } from '../core/auth-guard.js';
import { bindFileDropzone, bindOverlayToggle, qs, registerPageCleanup, formatMoney } from '../core/utils.js';
import { renderRoleMenu } from '../core/role-menu.js';
import { uploadContractFile } from '../firebase/firebase-storage.js';
import { saveContract, updateContract, deleteContract, watchContracts } from '../firebase/firebase-db.js';

const menu = qs('#sidebar-menu');
const listBody = qs('#contract-list');
const message = qs('#contract-message');
const filterToggleButton = qs('#openContractFilterBtn');
const filterOverlay = qs('#contractFilterOverlay');
const resetButton = qs('#contract-form-reset');
const editButton = qs('#contract-edit-head');
const saveButton = qs('#contract-submit-head');
const deleteButton = qs('#contract-delete-head');
const titleNode = qs('#contract-detail-title');

const formMode = qs('#contract-form_mode');
const contractCodeHidden = qs('#contract_code_hidden');
const docInput = qs('#contract_docs');
const docDropzone = qs('#contract-doc-dropzone');
const docList = qs('#contract-doc-list');

const fields = {
  contract_code: qs('#contract_code'),
  contract_status: qs('#contract_status'),
  partner_code: qs('#partner_code'),
  policy_code: qs('#policy_code'),
  product_code: qs('#product_code'),
  car_number: qs('#car_number'),
  vehicle_name: qs('#vehicle_name'),
  rent_month: qs('#rent_month'),
  rent_amount: qs('#rent_amount'),
  deposit_amount: qs('#deposit_amount'),
  customer_name: qs('#customer_name'),
  customer_birth: qs('#customer_birth'),
  customer_phone: qs('#customer_phone'),
  deposit_confirmed: qs('#deposit_confirmed'),
  docs_confirmed: qs('#docs_confirmed'),
  contract_signed: qs('#contract_signed'),
  final_payment: qs('#final_payment'),
  vehicle_delivered: qs('#vehicle_delivered')
};

let currentProfile = null;
let allContracts = [];

function syncHeadButtons(nextMode) {
  if (editButton) editButton.style.display = nextMode === 'view' ? '' : 'none';
  if (saveButton) saveButton.style.display = nextMode === 'view' ? 'none' : '';
}
let currentContract = null;
let mode = 'create';
let pendingDocUrls = [];

function setTitle(text = '계약정보') {
  if (titleNode) titleNode.textContent = text;
}

function setMode(nextMode) {
  mode = nextMode;
  if (formMode) formMode.value = nextMode;
  const form = qs('#contract-form');
  form?.classList.remove('is-view-mode','is-edit-mode');
  form?.classList.add(nextMode === 'view' ? 'is-view-mode' : 'is-edit-mode');
  const isCreate = nextMode === 'create';
  const isView = nextMode === 'view';

  deleteButton.disabled = isCreate || !(currentProfile?.role === 'provider' || currentProfile?.role === 'admin');
  saveButton.disabled = false;

  const isAgent = currentProfile?.role === 'agent';
  const canManageProvider = currentProfile?.role === 'provider' || currentProfile?.role === 'admin';

  ['customer_name','customer_birth','customer_phone'].forEach((key) => {
    fields[key].readOnly = isView || !isAgent;
  });

  ['deposit_confirmed','docs_confirmed','contract_signed','final_payment','vehicle_delivered'].forEach((key) => {
    fields[key].disabled = isView || !canManageProvider;
  });

  fields.contract_status.disabled = isView || !canManageProvider;
  docInput.disabled = isView || !isAgent;
  editButton.disabled = isCreate;
  syncHeadButtons(isCreate ? 'create' : nextMode);
}

function buildVehicleName(seed) {
  return seed.vehicle_name || [seed.maker, seed.model_name, seed.sub_model, seed.trim_name].filter(Boolean).join(' ');
}

function renderDocs(items = []) {
  docList.innerHTML = items.map((item) => {
    const isImage = String(item.type || '').startsWith('image/');
    return `
      <div class="doc-preview-item">
        <div class="doc-preview-thumb">${isImage ? `<img src="${item.url}" alt="${item.name}">` : 'FILE'}</div>
        <div class="doc-preview-meta">${item.name}</div>
      </div>
    `;
  }).join('');
}

function resetForm() {
  currentContract = null;
  contractCodeHidden.value = '';
  pendingDocUrls = [];
  Object.entries(fields).forEach(([key, node]) => {
    if (!node) return;
    if (node.type === 'checkbox') node.checked = false;
    else node.value = '';
  });
  renderDocs([]);
  setTitle('계약정보');
  setMode('create');
  message.textContent = '';
  renderList();
}

function fillForm(contract) {
  currentContract = contract;
  contractCodeHidden.value = contract.contract_code || '';
  fields.contract_code.value = contract.contract_code || '';
  fields.contract_status.value = contract.contract_status || '계약대기';
  fields.partner_code.value = contract.partner_code || '';
  fields.policy_code.value = contract.policy_code || '';
  fields.product_code.value = contract.product_code || '';
  fields.car_number.value = contract.car_number || '';
  fields.vehicle_name.value = contract.vehicle_name || '';
  fields.rent_month.value = contract.rent_month ? `${contract.rent_month}개월` : '';
  fields.rent_amount.value = formatMoney(contract.rent_amount || 0);
  fields.deposit_amount.value = formatMoney(contract.deposit_amount || 0);
  fields.customer_name.value = contract.customer_name || '';
  fields.customer_birth.value = contract.customer_birth || '';
  fields.customer_phone.value = contract.customer_phone || '';

  const checks = contract.checks || {};
  fields.deposit_confirmed.checked = !!checks.deposit_confirmed;
  fields.docs_confirmed.checked = !!checks.docs_confirmed;
  fields.contract_signed.checked = !!checks.contract_signed;
  fields.final_payment.checked = !!checks.final_payment;
  fields.vehicle_delivered.checked = !!checks.vehicle_delivered;
  pendingDocUrls = contract.docs || [];
  renderDocs(pendingDocUrls);
  setTitle(`${contract.car_number || '-'} ${contract.vehicle_name?.split(' ')[2] || ''} 계약정보`);
  setMode('view');
  renderList();
}

function contractVisible(contract) {
  if (currentProfile?.role === 'admin') return true;
  if (currentProfile?.role === 'provider') return (contract.partner_code || '') === (currentProfile.company_code || '');
  if (currentProfile?.role === 'agent') return (contract.agent_uid || '') === (currentProfile.uid || '');
  return false;
}

function progressCount(contract) {
  const checks = contract.checks || {};
  const keys = ['deposit_confirmed','docs_confirmed','contract_signed','final_payment','vehicle_delivered'];
  return keys.filter((key) => checks[key]).length;
}

function renderList() {
  const visible = allContracts.filter(contractVisible);
  if (!visible.length) {
    listBody.innerHTML = '<div class="empty-block list-empty">등록된 계약이 없습니다.</div>';
    return;
  }

  listBody.innerHTML = visible.map((contract) => `
    <button type="button" class="summary-row ${contract.contract_code === contractCodeHidden.value ? 'is-selected' : ''}" data-code="${contract.contract_code}">
      <span class="summary-inline summary-inline-strong">${contract.contract_code || '-'}</span>
      <span class="summary-inline">${contract.customer_name || '고객정보 미입력'}</span>
      <span class="summary-inline">${contract.car_number || '-'}</span>
      <span class="summary-inline">${contract.contract_status || '계약대기'}</span>
    </button>
  `).join('');

  listBody.querySelectorAll('.summary-row').forEach((row) => {
    row.addEventListener('click', () => {
      const found = visible.find((item) => item.contract_code === row.dataset.code);
      if (found) fillForm(found);
    });
  });
}

function allChecksDone() {
  return ['deposit_confirmed','docs_confirmed','contract_signed','final_payment','vehicle_delivered']
    .every((key) => !!fields[key].checked);
}

function seedToPayload(seed) {
  return {
    partner_code: seed.partner_code || '',
    policy_code: seed.policy_code || '',
    product_code: seed.product_code || '',
    car_number: seed.car_number || '',
    vehicle_name: buildVehicleName(seed),
    rent_month: String(seed.rent_month || '48'),
    rent_amount: Number(seed.rent_amount || 0),
    deposit_amount: Number(seed.deposit_amount || 0),
    seed_product_key: seed.seed_product_key || '',
    agent_uid: currentProfile?.uid || '',
    agent_code: currentProfile?.user_code || '',
    agent_name: currentProfile?.name || currentProfile?.user_name || '',
    contract_status: '계약대기'
  };
}

async function maybeCreateFromPendingSeed() {
  const raw = localStorage.getItem('freepass_pending_contract_seed');
  if (!raw) return;
  localStorage.removeItem('freepass_pending_contract_seed');
  const seed = JSON.parse(raw);

  const existing = allContracts.find((item) =>
    item.seed_product_key === seed.seed_product_key &&
    item.agent_uid === currentProfile?.uid &&
    item.contract_status !== '계약완료'
  );

  if (existing) {
    fillForm(existing);
    return;
  }

  const code = await saveContract(seedToPayload(seed));
  const created = {
    contract_code: code,
    ...seedToPayload(seed),
    checks: {
      deposit_confirmed: false,
      docs_confirmed: false,
      contract_signed: false,
      final_payment: false,
      vehicle_delivered: false
    },
    docs: []
  };
  allContracts = [created, ...allContracts];
  fillForm(created);
  message.textContent = `계약 생성 완료: ${code}`;
}

async function handleSave() {
  const editingCode = contractCodeHidden.value.trim();
  const docs = [...pendingDocUrls];

  if (docInput.files?.length) {
    for (const file of Array.from(docInput.files)) {
      const url = await uploadContractFile(file, currentProfile?.uid || 'unknown');
      docs.push({ name: file.name, url, type: file.type || '' });
    }
  }

  const payload = {
    contract_status: allChecksDone() ? '계약완료' : (fields.contract_status.value || '계약대기'),
    customer_name: fields.customer_name.value.trim(),
    customer_birth: fields.customer_birth.value.trim(),
    customer_phone: fields.customer_phone.value.trim(),
    checks: {
      deposit_confirmed: fields.deposit_confirmed.checked,
      docs_confirmed: fields.docs_confirmed.checked,
      contract_signed: fields.contract_signed.checked,
      final_payment: fields.final_payment.checked,
      vehicle_delivered: fields.vehicle_delivered.checked
    },
    docs
  };

  if (!editingCode) {
    message.textContent = '계약은 상품상세에서 계약 버튼을 눌러 생성하세요.';
    return;
  }

  await updateContract(editingCode, payload);
  pendingDocUrls = docs;
  message.textContent = payload.contract_status === '계약완료'
    ? `저장 완료: ${editingCode} / 정산대기 등록`
    : `저장 완료: ${editingCode}`;
  const saved = allContracts.find((item) => item.contract_code === editingCode);
  if (saved) fillForm({ ...saved, ...payload, contract_code: editingCode });
}

async function handleDelete() {
  const editingCode = contractCodeHidden.value.trim();
  if (!editingCode) return;
  if (!window.confirm(`선택한 계약 ${editingCode} 를 삭제할까요?`)) return;
  await deleteContract(editingCode);
  message.textContent = `삭제 완료: ${editingCode}`;
  resetForm();
}

async function bootstrap() {
  try {
    const { user, profile } = await requireAuth({ roles: ['provider','agent','admin'] });
    currentProfile = { ...profile, uid: user.uid };
    renderRoleMenu(menu, profile.role);

    bindOverlayToggle(filterToggleButton, filterOverlay);

    editButton?.addEventListener('click', () => {
      if (!contractCodeHidden.value) return;
      setMode('edit');
    });
    saveButton?.addEventListener('click', async () => {
      try {
        await handleSave();
      } catch (error) {
        message.textContent = `저장 실패: ${error.message}`;
      }
    });
    deleteButton?.addEventListener('click', async () => {
      try {
        await handleDelete();
      } catch (error) {
        message.textContent = `삭제 실패: ${error.message}`;
      }
    });
    resetButton?.addEventListener('click', resetForm);

    docInput?.addEventListener('change', () => {
      const files = Array.from(docInput.files || []).map((file) => ({
        name: file.name,
        url: URL.createObjectURL(file),
        type: file.type || ''
      }));
      renderDocs([...pendingDocUrls, ...files]);
    });

    bindFileDropzone({
      dropzone: docDropzone,
      input: docInput,
      onFilesApplied: () => {
        const files = Array.from(docInput.files || []).map((file) => ({
          name: file.name,
          url: URL.createObjectURL(file),
          type: file.type || ''
        }));
        renderDocs([...pendingDocUrls, ...files]);
      }
    });

    registerPageCleanup(watchContracts((items) => {
      allContracts = items;
      renderList();
      const code = contractCodeHidden.value;
      if (code) {
        const selected = allContracts.find((item) => item.contract_code === code);
        if (selected) fillForm(selected);
      }
    }));

    resetForm();
    await maybeCreateFromPendingSeed();
  } catch (error) {
    console.error(error);
  }
}

bootstrap();
