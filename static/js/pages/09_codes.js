import { requireAuth } from '../core/auth-guard.js';
import { updateDetailPanelTitle } from '../core/management-skeleton.js';
import { qs, registerPageCleanup } from '../core/utils.js';
import { renderRoleMenu } from '../core/role-menu.js';
import { deleteCodeItem, saveCodeItem, updateCodeItem, watchCodeItems } from '../firebase/firebase-db.js';

const menu = qs('#sidebar-menu');
const form = qs('#code-form');
const message = qs('#code-message');
const filterToggleButton = qs('#openCodeFilterBtn');
const filterOverlay = qs('#codeFilterOverlay');
const list = qs('#code-item-list');
const editingCodeKeyInput = qs('#editing_code_key');
const resetButtons = [qs('#code-form-reset')].filter(Boolean);
const submitButtons = [qs('#code-submit-head')].filter(Boolean);
const deleteButtons = [qs('#code-delete-head')].filter(Boolean);

let currentItems = [];
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
    const alwaysReadOnly = ['code_key_preview'];
    if (field.tagName !== 'SELECT') field.readOnly = alwaysReadOnly.includes(id);

    if (isView) {
      field.tabIndex = -1;
      field.blur();
    } else {
      field.removeAttribute('tabindex');
    }
  });
  updateDetailPanelTitle(form, '코드', nextMode);
  submitButtons.forEach((button)=>{ if(button) button.textContent = isView ? '수정' : '저장'; });
  deleteButtons.forEach((button)=>{ if(button) button.disabled = mode !== 'edit'; });
}

function updateActionButtons() {
  applyFormMode(formMode);
}

function setCreateMode() {
  mode = 'create';
  editingCodeKeyInput.value = '';
  form.reset();
  qs('#sort_order').value = 0;
  qs('#is_active').value = 'true';
  applyFormMode('create');
  renderList(currentItems);
}

function fillForm(item) {
  mode = 'edit';
  editingCodeKeyInput.value = item.code_key || '';
  qs('#group_code').value = item.group_code || '';
  qs('#item_code').value = item.item_code || '';
  qs('#item_name').value = item.item_name || '';
  qs('#code_note').value = item.note || '';
  qs('#sort_order').value = item.sort_order ?? 0;
  qs('#is_active').value = item.is_active === false ? 'false' : 'true';
  applyFormMode('view');
  renderList(currentItems);
}

function renderList(items) {
  if (!items.length) {
    list.innerHTML = '<div class="empty-block list-empty">등록된 코드가 없습니다.</div>';
    return;
  }
  list.innerHTML = items.map((item) => `
    <button type="button" class="summary-row admin-summary-row management-summary-row ${editingCodeKeyInput.value === item.code_key ? 'is-selected' : ''}" data-key="${item.code_key}">
      <span class="summary-inline summary-inline-strong">${item.group_code}</span>
      <span class="summary-inline">${item.item_code}</span>
      <span class="summary-inline">${item.item_name}</span>
      <span class="summary-inline">${item.is_active === false ? '미사용' : '사용'}</span>
    </button>
  `).join('');
  list.querySelectorAll('.summary-row').forEach((row) => row.addEventListener('click', () => {
    const selected = items.find((item) => item.code_key === row.dataset.key);
    if (selected) fillForm(selected);
  }));
}

async function handleSubmit() {
  const payload = {
    group_code: qs('#group_code').value.trim(),
    item_code: qs('#item_code').value.trim(),
    item_name: qs('#item_name').value.trim(),
    note: qs('#code_note').value.trim(),
    sort_order: Number(qs('#sort_order').value || 0),
    is_active: qs('#is_active').value === 'true',
    created_by: currentUid
  };
  const editingKey = editingCodeKeyInput.value.trim();
  if (!editingKey) {
    const key = await saveCodeItem(payload);
    message.textContent = `저장 완료: ${key}`;
    const saved = currentItems.find((item) => item.code_key === key) || { ...payload, code_key: key };
    fillForm(saved);
    applyFormMode('view');
  } else {
    await updateCodeItem(editingKey, payload);
    message.textContent = `수정 완료: ${editingKey}`;
    const saved = currentItems.find((item) => item.code_key === editingKey) || { ...payload, code_key: editingKey };
    fillForm(saved);
    applyFormMode('view');
  }
}

async function handleDelete() {
  const editingKey = editingCodeKeyInput.value.trim();
  if (!editingKey) {
    message.textContent = '삭제할 코드를 먼저 선택하세요.';
    return;
  }
  if (!window.confirm(`선택한 코드 ${editingKey} 를 삭제할까요?`)) return;
  await deleteCodeItem(editingKey);
  message.textContent = `삭제 완료: ${editingKey}`;
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

    registerPageCleanup(watchCodeItems((items) => {
      currentItems = items;
      renderList(currentItems);
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
