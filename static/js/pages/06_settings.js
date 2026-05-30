import { requireAuth } from '../core/auth-guard.js';
import { qs, roleLabel } from '../core/utils.js';
import { renderRoleMenu } from '../core/role-menu.js';
import { logoutCurrentUser } from '../firebase/firebase-auth.js';

async function bootstrap() {
  try {
    const { profile } = await requireAuth({ roles: ['provider', 'agent', 'admin'] });
    renderRoleMenu(qs('#sidebar-menu'), profile.role);
    qs('#settings-name').textContent = profile.name || '-';
    qs('#settings-email').textContent = profile.email || '-';
    qs('#settings-role').textContent = roleLabel(profile.role);
    qs('#settings-status').textContent = profile.status || '-';
    qs('#settings-user-code').textContent = profile.user_code || profile.admin_code || '-';
    qs('#settings-company-code').textContent = profile.company_code || '-';
    qs('#settings-company-name').textContent = profile.company_name || '-';

    qs('#logout-button')?.addEventListener('click', async () => {
      await logoutCurrentUser();
      window.location.href = '/login';
    });
  } catch (error) {
    qs('#settings-message').textContent = error.message;
  }
}

bootstrap();

const roleCopyNode = document.getElementById('settings-role-copy');
if (roleCopyNode) {
  const syncRoleCopy = () => {
    const roleNode = document.getElementById('settings-role');
    roleCopyNode.textContent = roleNode ? roleNode.textContent : '-';
  };
  setTimeout(syncRoleCopy, 0);
}
