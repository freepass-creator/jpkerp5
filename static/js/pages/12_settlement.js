const filterBtn = document.getElementById('openSettlementFilterBtn');
const filterOverlay = document.getElementById('settlementFilterOverlay');
filterBtn?.addEventListener('click', () => {
  const isOpen = filterOverlay?.classList.contains('is-open');
  filterOverlay?.classList.toggle('is-open', !isOpen);
  filterOverlay?.setAttribute('aria-hidden', String(isOpen));
});

import { bootstrapManagementSkeleton } from '../core/management-skeleton.js';

bootstrapManagementSkeleton({
  listId: 'settlement-list',
  formId: 'settlement-form',
  resetId: 'settlement-form-reset',
  submitId: 'settlement-submit-head',
  deleteId: 'settlement-delete-head',
  messageId: 'settlement-message',
  titleLabel: '정산',
  itemLabel: 'settlement'
}).catch((error) => {
  console.error(error);
});
