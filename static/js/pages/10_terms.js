import { requireAuth } from '../core/auth-guard.js';
import { updateDetailPanelTitle } from '../core/management-skeleton.js';
import { qs, registerPageCleanup } from '../core/utils.js';
import { renderRoleMenu } from '../core/role-menu.js';
import { deleteTerm, saveTerm, updateTerm, watchTerms, watchPartners } from '../firebase/firebase-db.js';

const menu = qs('#sidebar-menu');
const list = qs('#term-list');
const form = qs('#term-form');
const message = qs('#term-message');
const filterToggleButton = qs('#openTermFilterBtn');
const filterOverlay = qs('#termFilterOverlay');
const providerCodeInput = qs('#term_provider_code');
const previewCodeInput = qs('#term_code_preview');
const editingCodeInput = qs('#editing_term_code');
const resetButtons = [qs('#term-form-reset')].filter(Boolean);
const submitButtons = [qs('#term-submit-head')].filter(Boolean);
const deleteButtons = [qs('#term-delete-head')].filter(Boolean);

const detailFields = {
  injury_limit_deductible: qs('#injury_limit_deductible'),
  property_limit_deductible: qs('#property_limit_deductible'),
  personal_injury_limit_deductible: qs('#personal_injury_limit_deductible'),
  uninsured_limit_deductible: qs('#uninsured_limit_deductible'),
  own_damage_limit_deductible: qs('#own_damage_limit_deductible'),
  roadside_assistance: qs('#roadside_assistance'),
  basic_driver_age: qs('#basic_driver_age'),
  rental_region: qs('#rental_region'),
  payment_method: qs('#payment_method'),
  driver_scope: qs('#driver_scope'),
  driver_age_lowering: qs('#driver_age_lowering'),
  age_lowering_cost: qs('#age_lowering_cost'),
  annual_mileage: qs('#annual_mileage'),
  extra_10k_mileage_cost: qs('#extra_10k_mileage_cost'),
  early_termination_fee: qs('#early_termination_fee'),
  delivery_fee: qs('#delivery_fee')
};

const CONTENT_KEYS = Object.keys(detailFields);
const FILTER_KEYS = ['driver_age_lowering', 'annual_mileage'];
const CONTENT_LABELS = {
  injury_limit_deductible: '대인한도 및 면책금',
  property_limit_deductible: '대물한도 및 면책금',
  personal_injury_limit_deductible: '자손한도 및 면책금',
  uninsured_limit_deductible: '무보험차상해한도 및 면책금',
  own_damage_limit_deductible: '자기차량손해한도 및 면책금',
  roadside_assistance: '긴급출동',
  basic_driver_age: '기본운전연령',
  rental_region: '대여지역',
  payment_method: '결제방식',
  driver_scope: '운전자범위',
  driver_age_lowering: '운전연령하향',
  age_lowering_cost: '연령하향비용',
  annual_mileage: '연간약정주행거리',
  extra_10k_mileage_cost: '1만Km추가시',
  early_termination_fee: '중도해지위약금',
  delivery_fee: '탁송비용'
};

let currentTerms = [];
let currentProfile = null;
let currentUid = '';
let mode = 'create';
let availableProviders = [];
let lastSelectedCode = '';
let formMode = 'create';

function applyFormMode(nextMode) {
  formMode = nextMode;
  const isView = nextMode === 'view';
  form.dataset.mode = nextMode;
  form.classList.toggle('is-view-mode', isView);

  form.querySelectorAll('input, select, textarea').forEach((field) => {
    if (field.type === 'hidden') return;
    const id = field.id || '';
    const alwaysReadOnly = ['term_code_preview'];

    if (field.tagName === 'SELECT') {
      field.disabled = nextMode === 'create' && id === 'term_provider_code' && currentProfile?.role !== 'admin';
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

  updateDetailPanelTitle(form, '정책', nextMode);
  submitButtons.forEach((button) => { if (button) button.textContent = isView ? '수정' : '저장'; });
  deleteButtons.forEach((button) => { if (button) button.disabled = mode !== 'edit'; });
}

function renderProviderOptions(selectedCode = '') {
  if (currentProfile?.role === 'admin') {
    const providers = availableProviders.filter((item) => item.partner_type === 'provider' && item.status !== 'inactive' && item.status !== 'deleted');
    providerCodeInput.disabled = false;
    providerCodeInput.innerHTML = providers.length
      ? providers.map((partner) => `<option value="${partner.partner_code}">${partner.partner_code} | ${partner.partner_name}</option>`).join('')
      : '<option value="">등록된 공급사 없음</option>';
    if (selectedCode && providers.some((item) => item.partner_code === selectedCode)) {
      providerCodeInput.value = selectedCode;
    } else if (!providers.some((item) => item.partner_code === providerCodeInput.value)) {
      providerCodeInput.value = providers[0]?.partner_code || '';
    }
    return;
  }
  providerCodeInput.innerHTML = '';
  const code = currentProfile?.company_code || '';
  const label = currentProfile?.company_name ? `${code} | ${currentProfile.company_name}` : code;
  providerCodeInput.innerHTML = `<option value="${code}">${label}</option>`;
  providerCodeInput.value = code;
  providerCodeInput.disabled = true;
}

function updatePreviewCode() {
  const providerCode = providerCodeInput.value || currentProfile?.company_code || '';
  previewCodeInput.value = providerCode ? `${providerCode}_T***` : '공급사코드를 먼저 선택하세요';
}

function clearDetailFields() {
  CONTENT_KEYS.forEach((key) => {
    if (detailFields[key]) detailFields[key].value = '';
  });
}

function parseStructuredContent(content) {
  const raw = String(content || '').trim();
  if (!raw) return { fields: {} };

  const lines = raw.split('\n');
  const fields = {};

  lines.forEach((line) => {
    const normalized = line.trim();
    if (!normalized) return;
    const matchedKey = CONTENT_KEYS.find((key) => normalized.startsWith(`${CONTENT_LABELS[key]}:`));
    if (!matchedKey) return;
    const value = normalized.slice(`${CONTENT_LABELS[matchedKey]}:`.length).trim();
    fields[matchedKey] = value;
  });

  return { fields };
}

function buildStructuredContent() {
  const lines = [];
  CONTENT_KEYS.forEach((key) => {
    const value = String(detailFields[key]?.value || '').trim();
    if (!value) return;
    lines.push(`${CONTENT_LABELS[key]}: ${value}`);
  });
  return lines.join('\n').trim();
}

function buildFilterFieldsPayload() {
  return {
    driver_age_lowering: String(detailFields.driver_age_lowering?.value || '').trim(),
    annual_mileage: String(detailFields.annual_mileage?.value || '').trim()
  };
}

function setCreateMode(selectedProviderCode = '') {
  mode = 'create';
  editingCodeInput.value = '';
  form.reset();
  clearDetailFields();
  renderProviderOptions(selectedProviderCode || currentProfile?.company_code || '');
  updatePreviewCode();
  applyFormMode('create');
  renderList(currentTerms);
}

function fillForm(term) {
  mode = 'edit';
  editingCodeInput.value = term.term_code || '';
  lastSelectedCode = term.term_code || '';
  renderProviderOptions(term.provider_company_code || '');
  previewCodeInput.value = term.term_code || '';
  qs('#term_name_input').value = term.term_name || '';
  qs('#term_note').value = term.note || '';

  clearDetailFields();
  const parsed = parseStructuredContent(term.content || '');
  CONTENT_KEYS.forEach((key) => {
    if (!detailFields[key]) return;
    if (FILTER_KEYS.includes(key) && String(term[key] || '').trim()) {
      detailFields[key].value = String(term[key] || '').trim();
      return;
    }
    detailFields[key].value = parsed.fields[key] || '';
  });

  applyFormMode('view');
  renderList(currentTerms);
}

function renderList(terms) {
  if (!terms.length) {
    list.innerHTML = '<div class="empty-block list-empty">등록된 정책이 없습니다.</div>';
    return;
  }
  list.innerHTML = terms.map((term) => `
    <button type="button" class="summary-row admin-summary-row management-summary-row ${editingCodeInput.value === term.term_code ? 'is-selected' : ''}" data-code="${term.term_code}">
      <span class="summary-inline summary-inline-strong">${term.term_code}</span>
      <span class="summary-inline">${term.term_name || '-'}</span>
      <span class="summary-inline">${term.provider_company_code || '-'}</span>
      <span class="summary-inline">${term.status || 'active'}</span>
    </button>
  `).join('');
  list.querySelectorAll('.summary-row').forEach((row) => row.addEventListener('click', () => {
    const selected = terms.find((item) => item.term_code === row.dataset.code);
    if (selected) fillForm(selected);
  }));
}

function findTermByCode(code) {
  return currentTerms.find((item) => item.term_code === code) || null;
}

function keepEditState(termCode, payload) {
  const current = findTermByCode(termCode) || {};
  const merged = {
    ...current,
    ...payload,
    term_code: termCode,
    provider_company_code: payload.provider_company_code || current.provider_company_code || '',
    term_name: payload.term_name || current.term_name || '',
    note: payload.note || current.note || '',
    content: payload.content || current.content || '',
    driver_age_lowering: payload.driver_age_lowering || current.driver_age_lowering || '',
    annual_mileage: payload.annual_mileage || current.annual_mileage || ''
  };
  fillForm(merged);
}

async function handleSubmit() {
  const providerCode = providerCodeInput.value || currentProfile.company_code || '';
  if (!providerCode) throw new Error('공급사코드를 선택하세요.');
  const payload = {
    provider_company_code: providerCode,
    term_name: qs('#term_name_input').value.trim(),
    note: qs('#term_note').value.trim(),
    content: buildStructuredContent(),
    ...buildFilterFieldsPayload(),
    status: 'active',
    created_by: currentUid
  };
  const editingCode = editingCodeInput.value.trim();
  if (!editingCode) {
    const termCode = await saveTerm(payload);
    lastSelectedCode = termCode;
    keepEditState(termCode, payload);
    applyFormMode('view');
    message.textContent = `저장 완료: ${termCode}`;
    return;
  }
  await updateTerm(editingCode, payload);
  lastSelectedCode = editingCode;
  keepEditState(editingCode, payload);
  applyFormMode('view');
  message.textContent = `수정 완료: ${editingCode}`;
}

async function handleDelete() {
  const editingCode = editingCodeInput.value.trim();
  if (!editingCode) {
    message.textContent = '삭제할 정책을 먼저 선택하세요.';
    return;
  }
  if (!window.confirm(`선택한 정책 ${editingCode} 를 삭제할까요?`)) return;
  await deleteTerm(editingCode);
  message.textContent = `삭제 완료: ${editingCode}`;
  lastSelectedCode = '';
  setCreateMode(providerCodeInput.value || currentProfile?.company_code || '');
}

async function bootstrap() {
  try {
    const { user, profile } = await requireAuth({ roles: ['provider', 'admin'] });
    currentUid = user.uid;
    currentProfile = profile;
    renderRoleMenu(menu, profile.role);
    filterToggleButton?.addEventListener('click', () => {
      const isOpen = filterOverlay?.classList.contains('is-open');
      filterOverlay?.classList.toggle('is-open', !isOpen);
      filterOverlay?.setAttribute('aria-hidden', String(isOpen));
    });

    registerPageCleanup(watchPartners((partners) => {
      availableProviders = partners;
      renderProviderOptions(providerCodeInput.value || profile.company_code || '');
      if (mode === 'create') updatePreviewCode();
    }));

    resetButtons.forEach((button) => button?.addEventListener('click', () => setCreateMode()));
    submitButtons.forEach((button) => button?.addEventListener('click', () => {
      if (mode === 'edit' && formMode === 'view') {
        applyFormMode('edit');
        message.textContent = '수정 상태입니다.';
        return;
      }
      form.requestSubmit();
    }));
    deleteButtons.forEach((button) => button?.addEventListener('click', async () => {
      try {
        await handleDelete();
      } catch (error) {
        message.textContent = `삭제 실패: ${error.message}`;
      }
    }));

    registerPageCleanup(watchTerms((terms) => {
      currentTerms = profile.role === 'admin' ? terms : terms.filter((term) => term.provider_company_code === profile.company_code);
      renderList(currentTerms);
      if (lastSelectedCode) {
        const selected = findTermByCode(lastSelectedCode);
        if (selected) {
          fillForm(selected);
          return;
        }
      }
      if (!editingCodeInput.value) setCreateMode(providerCodeInput.value || profile.company_code || '');
    }));

    providerCodeInput.addEventListener('change', updatePreviewCode);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await handleSubmit();
      } catch (error) {
        message.textContent = `저장 실패: ${error.message}`;
      }
    });

    setCreateMode(profile.company_code || '');
  } catch (error) {
    if (message) message.textContent = error.message;
  }
}

bootstrap();
