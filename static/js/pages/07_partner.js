import { requireAuth } from '../core/auth-guard.js';
import { updateDetailPanelTitle } from '../core/management-skeleton.js';
import { qs, registerPageCleanup } from '../core/utils.js';
import { renderRoleMenu } from '../core/role-menu.js';
import { deletePartner, savePartner, updatePartner, watchPartners } from '../firebase/firebase-db.js';

const menu = qs('#sidebar-menu');
const form = qs('#partner-form');
const message = qs('#partner-message');
const filterToggleButton = qs('#openPartnerFilterBtn');
const filterOverlay = qs('#partnerFilterOverlay');
const list = qs('#partner-list');
const typeInput = qs('#partner_type');
const preview = qs('#partner_code_preview');
const editingCodeInput = qs('#editing_partner_code');
const statusInput = qs('#partner_status');
const resetButtons = [qs('#partner-form-reset')].filter(Boolean);
const submitButtons = [qs('#partner-submit-head')].filter(Boolean);
const deleteButtons = [qs('#partner-delete-head')].filter(Boolean);

let currentPartners = [];
let mode = 'create';
let currentUid = '';
let formMode = 'create';

function applyFormMode(nextMode) {
  formMode = nextMode;
  const isView = nextMode === 'view';
  form.classList.toggle('is-view-mode', isView);
  form.querySelectorAll('input, select, textarea').forEach((field) => {
    if (field.type === 'hidden') return;
    const id = field.id || '';
    const alwaysReadOnly = ['partner_code_preview'];

    if (field.tagName === 'SELECT') {
      field.disabled = id === 'partner_type' && mode === 'edit';
    } else {
      field.readOnly = alwaysReadOnly.includes(id);
    }

    if (isView) {
      field.tabIndex = -1;
      field.blur();
    } else {
      field.removeAttribute('tabindex');
    }
  });
  updateDetailPanelTitle(form, '파트너', nextMode);
  submitButtons.forEach((button)=>{ if(button) button.textContent = isView ? '수정' : '저장'; });
  deleteButtons.forEach((button)=>{ if(button) button.disabled = mode !== 'edit'; });
}

function updatePreview() {
  if (mode === 'edit' && editingCodeInput.value) {
    preview.value = editingCodeInput.value;
    return;
  }
  preview.value = typeInput.value === 'provider' ? 'RP001' : 'SP001';
}

function updateActionButtons() {
  applyFormMode(formMode);
}

function setCreateMode() {
  mode = 'create';
  editingCodeInput.value = '';
  form.reset();
  statusInput.value = 'active';
  updatePreview();
  applyFormMode('create');
  renderList(currentPartners);
}

function fillForm(partner) {
  mode = 'edit';
  editingCodeInput.value = partner.partner_code;
  typeInput.value = partner.partner_type || 'provider';
  preview.value = partner.partner_code || '';
  qs('#partner_business_number').value = partner.business_number || '';
  qs('#partner_name').value = partner.partner_name || '';
  qs('#partner_ceo_name').value = partner.ceo_name || '';
  qs('#partner_address').value = partner.address || '';
  qs('#partner_company_phone').value = partner.company_phone || '';
  qs('#partner_email').value = partner.email || '';
  qs('#partner_manager_name').value = partner.manager_name || '';
  qs('#partner_manager_position').value = partner.manager_position || '';
  qs('#partner_manager_phone').value = partner.manager_phone || '';
  qs('#partner_fax').value = partner.fax || '';
  qs('#partner_note').value = partner.note || '';
  statusInput.value = partner.status || 'active';
  applyFormMode('view');
  renderList(currentPartners);
}

function renderList(partners) {
  if (!partners.length) {
    list.innerHTML = '<div class="empty-block list-empty">등록된 파트너가 없습니다.</div>';
    return;
  }
  list.innerHTML = partners.map((partner) => `
    <button type="button" class="summary-row admin-summary-row management-summary-row ${editingCodeInput.value === partner.partner_code ? 'is-selected' : ''}" data-code="${partner.partner_code}">
      <span class="summary-inline summary-inline-strong">${partner.partner_code}</span>
      <span class="summary-inline">${partner.partner_type === 'provider' ? '공급사' : '영업채널'}</span>
      <span class="summary-inline">${partner.partner_name || '-'}</span>
      <span class="summary-inline">${partner.ceo_name || '-'}</span>
    </button>
  `).join('');
  list.querySelectorAll('.summary-row').forEach((row) => row.addEventListener('click', () => {
    const selected = currentPartners.find((item) => item.partner_code === row.dataset.code);
    if (selected) fillForm(selected);
  }));
}

async function handleSubmit() {
  const payload = {
    partner_type: typeInput.value,
    business_number: qs('#partner_business_number').value.trim(),
    partner_name: qs('#partner_name').value.trim(),
    ceo_name: qs('#partner_ceo_name').value.trim(),
    address: qs('#partner_address').value.trim(),
    company_phone: qs('#partner_company_phone').value.trim(),
    email: qs('#partner_email').value.trim(),
    manager_name: qs('#partner_manager_name').value.trim(),
    manager_position: qs('#partner_manager_position').value.trim(),
    manager_phone: qs('#partner_manager_phone').value.trim(),
    fax: qs('#partner_fax').value.trim(),
    note: qs('#partner_note').value.trim(),
    status: statusInput.value,
    created_by: currentUid
  };
  const editingCode = editingCodeInput.value.trim();
  if (!editingCode) {
    const code = await savePartner(payload);
    message.textContent = `저장 완료: ${code}`;
    const saved = currentPartners.find((item) => item.partner_code === code) || { ...payload, partner_code: code };
    fillForm(saved);
    applyFormMode('view');
  } else {
    await updatePartner(editingCode, payload);
    message.textContent = `수정 완료: ${editingCode}`;
    const saved = currentPartners.find((item) => item.partner_code === editingCode) || { ...payload, partner_code: editingCode };
    fillForm(saved);
    applyFormMode('view');
  }
}

async function handleDelete() {
  const editingCode = editingCodeInput.value.trim();
  if (!editingCode) {
    message.textContent = '삭제할 파트너를 먼저 선택하세요.';
    return;
  }
  if (!window.confirm(`선택한 파트너 ${editingCode} 를 삭제할까요?`)) return;
  await deletePartner(editingCode);
  message.textContent = `삭제 완료: ${editingCode}`;
  setCreateMode();
}

async function bootstrap() {
  try {
    const { user, profile } = await requireAuth({ roles: ['admin'] });
    currentUid = user.uid;
    renderRoleMenu(menu, profile.role);
    filterToggleButton?.addEventListener('click', () => {
      const isOpen = filterOverlay?.classList.contains('is-open');
      filterOverlay?.classList.toggle('is-open', !isOpen);
      filterOverlay?.setAttribute('aria-hidden', String(isOpen));
    });
    updatePreview();
    typeInput.addEventListener('change', updatePreview);
    resetButtons.forEach((button) => button?.addEventListener('click', setCreateMode));
    submitButtons.forEach((button) => button?.addEventListener('click', () => {
      if (mode === 'edit' && formMode === 'view') {
        applyFormMode('edit');
        message.textContent = '수정 상태입니다.';
        return;
      }
      form.requestSubmit();
    }));
    deleteButtons.forEach((button) => button?.addEventListener('click', async () => {
      try { await handleDelete(); } catch (error) { message.textContent = `삭제 실패: ${error.message}`; }
    }));

    registerPageCleanup(watchPartners((partners) => {
      currentPartners = partners;
      renderList(currentPartners);
    }));

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      try { await handleSubmit(); } catch (error) { message.textContent = `저장 실패: ${error.message}`; }
    });

    setCreateMode();
  } catch (error) {
    console.error(error);
  }
}

bootstrap();
