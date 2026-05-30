import { requireAuth } from './auth-guard.js';
import { qs } from './utils.js';
import { renderRoleMenu } from './role-menu.js';

export function updateDetailPanelTitle(form, baseLabel, panelMode = 'view') {
  const title = form?.closest('.panel')?.querySelector('.panel-head-title');
  if (!title || !baseLabel) return;

  const suffixMap = {
    create: '등록',
    edit: '수정',
    view: '정보'
  };

  title.textContent = `${baseLabel} ${suffixMap[panelMode] || suffixMap.view}`;
}

function applyFormMode({ form, submitButton, deleteButton, modeField, message, mode, viewMode, titleLabel }) {
  if (modeField) modeField.value = mode;
  const panelMode = mode === 'create' ? 'create' : (viewMode ? 'view' : 'edit');
  updateDetailPanelTitle(form, titleLabel, panelMode);
  form?.classList.toggle('is-view-mode', viewMode);
  form?.querySelectorAll('input, select, textarea').forEach((field) => {
    if (field.type === 'hidden') return;
    if (viewMode) {
      field.tabIndex = -1;
      field.blur();
    } else {
      field.removeAttribute('tabindex');
    }
  });

  if (submitButton) submitButton.textContent = viewMode ? '수정' : '저장';
  if (deleteButton) deleteButton.disabled = mode !== 'edit';
  if (message) message.textContent = '';
}

export async function bootstrapManagementSkeleton(options = {}) {
  const {
    roles = ['provider', 'agent', 'admin'],
    listId,
    formId,
    resetId,
    submitId,
    deleteId,
    messageId,
    emptyText = '등록된 항목이 없습니다.',
    itemLabel = '항목',
    titleLabel = ''
  } = options;

  const { profile } = await requireAuth({ roles });
  renderRoleMenu(qs('#sidebar-menu'), profile.role);

  const list = qs(`#${listId}`);
  const form = qs(`#${formId}`);
  const resetButton = qs(`#${resetId}`);
  const submitButton = qs(`#${submitId}`);
  const deleteButton = qs(`#${deleteId}`);
  const message = qs(`#${messageId}`);
  const modeField = qs(`#${formId}_mode`);

  if (list && !list.children.length) {
    list.innerHTML = `<div class="empty-block list-empty">${emptyText}</div>`;
  }

  let currentMode = 'create';
  let selected = false;
  applyFormMode({ form, submitButton, deleteButton, modeField, message, mode: currentMode, viewMode: false, titleLabel });

  resetButton?.addEventListener('click', () => {
    form?.reset();
    currentMode = 'create';
    selected = false;
    applyFormMode({ form, submitButton, deleteButton, modeField, message, mode: currentMode, viewMode: false, titleLabel });
    if (message) message.textContent = `${itemLabel} 신규 입력 상태입니다.`;
  });

  submitButton?.addEventListener('click', () => {
    if (currentMode === 'edit') {
      const isView = form?.classList.contains('is-view-mode');
      if (isView) {
        applyFormMode({ form, submitButton, deleteButton, modeField, message, mode: currentMode, viewMode: false, titleLabel });
        if (message) message.textContent = `${itemLabel} 수정 상태입니다.`;
        return;
      }
    }

    if (message) {
      const modeText = currentMode === 'edit' ? '수정' : '저장';
      message.textContent = `${itemLabel} ${modeText} 기능은 다음 단계에서 연결합니다.`;
    }
    if (currentMode === 'edit') {
      applyFormMode({ form, submitButton, deleteButton, modeField, message, mode: currentMode, viewMode: true, titleLabel });
    }
  });

  deleteButton?.addEventListener('click', () => {
    if (message) message.textContent = `${itemLabel} 삭제 기능은 다음 단계에서 연결합니다.`;
  });

  list?.querySelectorAll('[data-mock-item]').forEach((row) => {
    row.addEventListener('click', () => {
      list.querySelectorAll('[data-mock-item]').forEach((node) => node.classList.remove('is-selected'));
      row.classList.add('is-selected');
      currentMode = 'edit';
      selected = true;
      const codeInput = form?.querySelector('[data-auto-code]');
      if (codeInput && !codeInput.value) codeInput.value = row.dataset.mockCode || '';
      applyFormMode({ form, submitButton, deleteButton, modeField, message, mode: currentMode, viewMode: true, titleLabel });
      if (message) message.textContent = `${itemLabel} 보기 상태입니다.`;
    });
  });
}
