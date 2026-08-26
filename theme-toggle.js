/**
 * Theme toggle: three-state (light | dark | system), persistent, system-aware,
 * reduced-motion-safe. Stores choice in localStorage under 'attendance-studio-theme'.
 * Usage: include this file at end of <body>. The page should have a select with
 * id="themeSelect" (added to index.html) or any element with id 'themeToggleBtn'.
 */
(function () {
  const STORAGE_KEY = 'attendance-studio-theme';
  const root = document.documentElement;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const selectId = 'themeSelect';

  function getStoredTheme() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }
  function storeTheme(theme) {
    try { if (theme === 'system') localStorage.removeItem(STORAGE_KEY); else localStorage.setItem(STORAGE_KEY, theme); } catch (e) { /* no-op */ }
  }

  function applyTheme(theme, { animate = true } = {}) {
    const effective = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;

    if (animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      root.classList.add('theme-transitioning');
      window.setTimeout(() => root.classList.remove('theme-transitioning'), 300);
    }

    if (effective === 'dark') {
      root.setAttribute('data-theme', 'dark');
      root.style.colorScheme = 'dark';
    } else {
      root.removeAttribute('data-theme');
      root.style.colorScheme = 'light';
    }
  }

  // Initialize
  const stored = getStoredTheme();
  const initial = stored || 'system';
  applyTheme(initial, { animate: false });

  // Keep in sync with OS when user selected 'system' (no stored preference)
  media.addEventListener('change', (e) => {
    if (!getStoredTheme()) applyTheme('system');
  });

  // Wire up select control if present
  document.addEventListener('DOMContentLoaded', () => {
    const sel = document.getElementById(selectId);
    if (sel) {
      // set current value
      const storedNow = getStoredTheme() || 'system';
      sel.value = storedNow;

      sel.addEventListener('change', (e) => {
        const val = sel.value;
        if (val === 'system') storeTheme('system'); else storeTheme(val);
        applyTheme(val, { animate: true });
      });

      // update select if OS preference changes and user hasn't chosen explicitly
      media.addEventListener('change', () => {
        if (!getStoredTheme()) sel.value = 'system';
      });
    }

    // Also support legacy button toggle (cycles values)
    const legacyBtn = document.getElementById('themeToggleBtn');
    if (legacyBtn) {
      legacyBtn.addEventListener('click', () => {
        const current = getStoredTheme() || 'system';
        const order = ['system', 'light', 'dark'];
        const next = order[(order.indexOf(current) + 1) % order.length];
        storeTheme(next);
        applyTheme(next, { animate: true });
        const selElem = document.getElementById(selectId);
        if (selElem) selElem.value = next;
      });
    }
  });
})();
