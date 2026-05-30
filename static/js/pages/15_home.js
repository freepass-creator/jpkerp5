import { requireAuth } from '../core/auth-guard.js';
import { qs } from '../core/utils.js';
import { renderRoleMenu } from '../core/role-menu.js';
(async()=>{try{const {profile}=await requireAuth({roles:['provider','agent','admin']});renderRoleMenu(qs('#sidebar-menu'), profile.role);}catch(e){console.error(e)}})();
