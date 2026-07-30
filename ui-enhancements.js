// ==========================================================================
// UI Enhancements — presentational layer only.
// Does NOT touch appData, Firebase, or any business logic.
// Relies on `currentUser` (declared in app.js) purely for read-only display.
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  initIcons();
  initAppLoader();
  initSidebarCollapse();
  initMobileDrawer();
  initThemeToggle();
  initHeaderDateTime();
  initBreadcrumbSync();
  initHeaderUserObserver();
  initStatCounterAnimation();
});

// ---- Lucide icons (static markup only; dynamic table content keeps emoji) ----
function initIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

// ---- Fake-but-honest loading skeleton for a smoother first paint ----
function initAppLoader() {
  const loader = document.getElementById('appLoader');
  if (!loader) return;
  window.addEventListener('load', () => {
    setTimeout(() => loader.classList.add('loader-hidden'), 250);
  });
  // Fallback in case 'load' already fired
  setTimeout(() => loader.classList.add('loader-hidden'), 1200);
}

// ---- Sidebar collapse (desktop) ----
function initSidebarCollapse() {
  const btn = document.getElementById('sidebarCollapseBtn');
  const shell = document.getElementById('appShellRoot');
  if (!btn || !shell) return;

  const applyCollapsedState = () => {
    const shouldCollapse = window.innerWidth > 900 && localStorage.getItem('ui_sidebar_collapsed') === 'true';
    shell.classList.toggle('sidebar-collapsed', shouldCollapse);
  };

  applyCollapsedState();

  btn.addEventListener('click', () => {
    if (window.innerWidth <= 900) return;
    shell.classList.toggle('sidebar-collapsed');
    localStorage.setItem('ui_sidebar_collapsed', shell.classList.contains('sidebar-collapsed'));
  });

  window.addEventListener('resize', applyCollapsedState);
}

// ---- Mobile slide-out drawer ----
function initMobileDrawer() {
  const shell = document.getElementById('appShellRoot');
  const menuBtn = document.getElementById('mobileMenuBtn');
  const overlay = document.getElementById('sidebarOverlay');
  if (!shell || !menuBtn || !overlay) return;

  const openDrawer = () => {
    shell.classList.add('sidebar-mobile-open');
    overlay.classList.add('show');
  };
  const closeDrawer = () => {
    shell.classList.remove('sidebar-mobile-open');
    overlay.classList.remove('show');
  };

  menuBtn.addEventListener('click', openDrawer);
  overlay.addEventListener('click', closeDrawer);

  // Close drawer after selecting a nav item on mobile
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.addEventListener('click', () => {
      if (window.innerWidth <= 900) closeDrawer();
    });
  });
}

// ---- Theme toggle (light / dark), persisted ----
function initThemeToggle() {
  const btn = document.getElementById('themeToggleBtn');
  const root = document.documentElement;
  if (!btn) return;

  const applyIcon = (theme) => {
    const icon = btn.querySelector('svg');
    if (!icon) return;
    icon.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
    initIcons();
  };

  const stored = localStorage.getItem('ui_theme');
  if (stored === 'dark') {
    root.setAttribute('data-theme', 'dark');
    applyIcon('dark');
  }

  btn.addEventListener('click', () => {
    const isDark = root.getAttribute('data-theme') === 'dark';
    if (isDark) {
      root.removeAttribute('data-theme');
      localStorage.setItem('ui_theme', 'light');
      applyIcon('light');
    } else {
      root.setAttribute('data-theme', 'dark');
      localStorage.setItem('ui_theme', 'dark');
      applyIcon('dark');
    }
  });
}

// ---- Header live date ----
function initHeaderDateTime() {
  const el = document.querySelector('#headerDateText span');
  if (!el) return;
  const update = () => {
    el.textContent = new Date().toLocaleDateString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    });
  };
  update();
  setInterval(update, 60 * 1000);
}

// ---- Breadcrumb + active nav label sync ----
function initBreadcrumbSync() {
  const crumb = document.getElementById('headerBreadcrumbCurrent');
  if (!crumb) return;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const label = btn.querySelector('.nav-label');
      if (label) crumb.textContent = label.textContent;
    });
  });
}

// ---- Keep sidebar user card + header avatar in sync with logged-in user ----
function initHeaderUserObserver() {
  const nameEl = document.getElementById('userNameDisplay');
  const roleEl = document.getElementById('userRoleDisplay');
  if (!nameEl || !roleEl) return;

  const sync = () => {
    const name = nameEl.textContent || 'User';
    const role = roleEl.textContent || '';
    const initial = name.trim().charAt(0).toUpperCase() || 'U';

    const headerAvatar = document.getElementById('headerAvatar');
    const sidebarAvatar = document.getElementById('sidebarAvatar');
    const sidebarName = document.getElementById('sidebarUserName');
    const sidebarRole = document.getElementById('sidebarUserRole');
    const welcome = document.getElementById('headerWelcomeText');

    if (headerAvatar) headerAvatar.textContent = initial;
    if (sidebarAvatar) sidebarAvatar.textContent = initial;
    if (sidebarName) sidebarName.textContent = name;
    if (sidebarRole) sidebarRole.textContent = role;
    if (welcome) welcome.textContent = `Welcome back, ${name.split(' ')[0]}`;
  };

  // React to app.js updating these text nodes on login / profile edits
  const observer = new MutationObserver(sync);
  observer.observe(nameEl, { childList: true, characterData: true, subtree: true });
  observer.observe(roleEl, { childList: true, characterData: true, subtree: true });

  sync();
}

// ---- Animated counters for the stats cards ----
function initStatCounterAnimation() {
  const ids = ['statTotalRecs', 'statPresentRecs', 'statAbsentRecs'];
  const targets = ids.map(id => document.getElementById(id)).filter(Boolean);
  if (!targets.length) return;

  const animate = (el, value, onDone) => {
    const end = parseInt(value, 10);
    if (isNaN(end)) { if (onDone) onDone(); return; }
    const start = 0;
    const duration = 450;
    const startTime = performance.now();
    const step = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(start + (end - start) * eased);
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = end;
        if (onDone) onDone();
      }
    };
    requestAnimationFrame(step);
  };

  targets.forEach(el => {
    let animating = false;
    let lastValue = el.textContent;
    const observer = new MutationObserver(() => {
      if (animating) return;
      const raw = el.textContent;
      if (raw !== lastValue && raw !== '' && !isNaN(parseInt(raw, 10))) {
        lastValue = raw;
        animating = true;
        animate(el, raw, () => { animating = false; lastValue = el.textContent; });
      }
    });
    observer.observe(el, { childList: true, characterData: true, subtree: true });
  });
}
