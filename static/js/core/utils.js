export function qs(selector) {
  return document.querySelector(selector);
}

export function formatMoney(value) {
  return Number(value || 0).toLocaleString('ko-KR');
}

export function roleLabel(role) {
  if (role === 'provider') return '공급사';
  if (role === 'agent') return '영업자';
  if (role === 'admin') return '관리자';
  return '-';
}

function getCleanupStore() {
  if (!window.__freepassPageCleanup) {
    window.__freepassPageCleanup = [];
  }
  return window.__freepassPageCleanup;
}

export function registerPageCleanup(cleanup) {
  if (typeof cleanup !== 'function') return cleanup;
  getCleanupStore().push(cleanup);
  return cleanup;
}

export function runPageCleanup() {
  const store = getCleanupStore();
  while (store.length) {
    const cleanup = store.pop();
    try {
      cleanup?.();
    } catch (error) {
      console.warn('page cleanup failed', error);
    }
  }
}

export function bindOverlayToggle(button, overlay) {
  if (!button || !overlay) return () => {};
  const handleClick = () => {
    const isOpen = overlay.classList.contains('is-open');
    overlay.classList.toggle('is-open', !isOpen);
    overlay.setAttribute('aria-hidden', String(isOpen));
  };
  button.addEventListener('click', handleClick);
  return () => button.removeEventListener('click', handleClick);
}

export function bindFileDropzone({ dropzone, input, onFilesApplied }) {
  if (!dropzone || !input) return () => {};

  const applyFiles = (files) => {
    if (!files) return;
    input.files = files;
    onFilesApplied?.(files);
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    dropzone.classList.add('is-dragover');
  };
  const handleDragLeave = () => dropzone.classList.remove('is-dragover');
  const handleDrop = (event) => {
    event.preventDefault();
    dropzone.classList.remove('is-dragover');
    applyFiles(event.dataTransfer?.files || null);
  };

  dropzone.addEventListener('dragover', handleDragOver);
  dropzone.addEventListener('dragleave', handleDragLeave);
  dropzone.addEventListener('drop', handleDrop);

  return () => {
    dropzone.removeEventListener('dragover', handleDragOver);
    dropzone.removeEventListener('dragleave', handleDragLeave);
    dropzone.removeEventListener('drop', handleDrop);
  };
}
