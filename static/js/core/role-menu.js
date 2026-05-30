
const ALL_MENUS = [
  { href: '/home', label: '홈', roles: ['provider','agent','admin'] },
  { href: '/product-list', label: '상품목록', roles: ['provider','agent','admin'] },
  { href: '/chat', label: '대화목록', roles: ['provider','agent','admin'] },
  { href: '/product-new', label: '상품관리', roles: ['provider','admin'] },
  { href: '/contract', label: '계약관리', roles: ['provider','agent','admin'] },
  { href: '/request', label: '요청하기', roles: ['provider','agent','admin'] },
  { href: '/settlement', label: '정산관리', roles: ['provider','agent','admin'] },
  { href: '/member', label: '회원관리', roles: ['admin'] },
  { href: '/terms', label: '정책관리', roles: ['provider','admin'] },
  { href: '/settings', label: '설정', roles: ['provider','agent','admin'] }
];

export function setMenuActive(container, pathname = window.location.pathname){
  container.querySelectorAll('.sidebar-link').forEach(link=>{
    const href = link.getAttribute('href');
    link.classList.toggle('is-active', href===pathname || (pathname==='/' && href==='/home'));
  });
}

export function renderRoleMenu(container, role){
  const items = ALL_MENUS.filter(i=>i.roles.includes(role));
  const frag = document.createDocumentFragment();

  items.forEach(item=>{
    const link = document.createElement('a');
    link.className='sidebar-link';
    link.href=item.href;
    link.textContent=item.label;
    frag.appendChild(link);
  });

  container.replaceChildren(frag);
  setMenuActive(container);
}
