import { runPageCleanup } from './core/utils.js';

const PAGE_STYLE_SELECTOR = 'link[data-page-style="true"]';
const PAGE_SCRIPT_SELECTOR = 'script[data-page-script="true"]';
const PAGE_MODULE_SELECTOR = 'script[type="module"][src*="/static/js/pages/"]';
const DASHBOARD_SELECTOR = '.dashboard-shell';
const MAIN_SHELL_SELECTOR = '.main-shell';
let pendingNavigationPath = '';
let isPageNavigating = false;

function isDashboardPage() {
  return Boolean(document.querySelector(DASHBOARD_SELECTOR));
}

function setActiveSidebar(pathname) {
  document.querySelectorAll('.sidebar-link').forEach((link) => {
    const isActive = link.getAttribute('href') === pathname;
    link.classList.toggle('active', isActive);
  });
}

function syncPageStyles(nextDoc) {
  document.querySelectorAll(PAGE_STYLE_SELECTOR).forEach((node) => node.remove());
  nextDoc.querySelectorAll('link[href*="/static/css/pages/"]').forEach((link) => {
    const clone = document.createElement('link');
    clone.rel = 'stylesheet';
    clone.href = link.href;
    clone.dataset.pageStyle = 'true';
    document.head.appendChild(clone);
  });
}

function executePageScripts(nextDoc) {
  document.querySelectorAll(PAGE_SCRIPT_SELECTOR).forEach((node) => node.remove());
  nextDoc.querySelectorAll(PAGE_MODULE_SELECTOR).forEach((script, index) => {
    const nextScript = document.createElement('script');
    nextScript.type = 'module';
    nextScript.src = `${script.src}${script.src.includes('?') ? '&' : '?'}pageLoad=${Date.now()}_${index}`;
    nextScript.dataset.pageScript = 'true';
    document.body.appendChild(nextScript);
  });
}

async function loadPage(url, options = {}) {
  const { pushState = true } = options;
  const nextPathname = new URL(url, window.location.origin).pathname;
  if (isPageNavigating && pendingNavigationPath === nextPathname) return;
  if (nextPathname === window.location.pathname && pushState) return;

  isPageNavigating = true;
  pendingNavigationPath = nextPathname;

  try {
    const response = await fetch(url, {
      headers: {
        'X-Requested-With': 'XMLHttpRequest'
      },
      credentials: 'same-origin'
    });

    if (!response.ok) {
      window.location.href = url;
      return;
    }

    const html = await response.text();
    const parser = new DOMParser();
    const nextDoc = parser.parseFromString(html, 'text/html');
    const nextMainShell = nextDoc.querySelector(MAIN_SHELL_SELECTOR);
    const currentMainShell = document.querySelector(MAIN_SHELL_SELECTOR);

    if (!nextMainShell || !currentMainShell) {
      window.location.href = url;
      return;
    }

    runPageCleanup();
    currentMainShell.replaceChildren(...Array.from(nextMainShell.childNodes).map((node) => node.cloneNode(true)));

    syncPageStyles(nextDoc);
    executePageScripts(nextDoc);

    document.title = nextDoc.title || document.title;
    document.body.dataset.page = nextDoc.body?.dataset?.page || '';
    setActiveSidebar(nextPathname);
    currentMainShell.scrollTop = 0;

    if (pushState) {
      window.history.pushState({ path: url }, '', url);
    }
  } finally {
    isPageNavigating = false;
    pendingNavigationPath = '';
  }
}

function getSidebarPath(link) {
  if (!link) return '';
  const href = link.getAttribute('href') || '';
  if (!href.startsWith('/')) return '';
  return new URL(href, window.location.origin).pathname;
}

function shouldIntercept(link, event) {
  if (!link) return false;
  if (event.defaultPrevented) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (link.target && link.target !== '_self') return false;
  const pathname = getSidebarPath(link);
  if (!pathname) return false;
  if (pathname === pendingNavigationPath) return false;
  return true;
}

function initShellNavigation() {
  if (!isDashboardPage()) return;

  document.addEventListener('click', async (event) => {
    const link = event.target.closest('.sidebar-link');
    if (!link) return;

    const nextPathname = getSidebarPath(link);
    if (!nextPathname) return;

    if (nextPathname === window.location.pathname || nextPathname === pendingNavigationPath) {
      event.preventDefault();
      setActiveSidebar(window.location.pathname);
      return;
    }

    if (!shouldIntercept(link, event)) return;

    event.preventDefault();
    pendingNavigationPath = nextPathname;
    setActiveSidebar(nextPathname);

    try {
      await loadPage(link.href);
    } catch (error) {
      console.error(error);
      window.location.href = link.href;
    }
  });

  window.addEventListener('popstate', async () => {
    if (!isDashboardPage()) return;
    try {
      await loadPage(window.location.pathname, { pushState: false });
    } catch (error) {
      console.error(error);
      window.location.reload();
    }
  });
}

initShellNavigation();
