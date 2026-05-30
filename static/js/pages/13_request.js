const filterBtn = document.getElementById('openRequestFilterBtn');
const filterOverlay = document.getElementById('requestFilterOverlay');
filterBtn?.addEventListener('click', () => {
  const isOpen = filterOverlay?.classList.contains('is-open');
  filterOverlay?.classList.toggle('is-open', !isOpen);
  filterOverlay?.setAttribute('aria-hidden', String(isOpen));
});

import { bootstrapManagementSkeleton } from '../core/management-skeleton.js';

bootstrapManagementSkeleton({
  listId: 'request-list',
  formId: 'request-form',
  resetId: 'request-form-reset',
  submitId: 'request-submit-head',
  deleteId: 'request-delete-head',
  messageId: 'request-message',
  titleLabel: '요청',
  itemLabel: 'request'
}).catch((error) => {
  console.error(error);
});
