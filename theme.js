/**
 * ADEDAYO AREMU AUTOS — THEME SWITCHER
 * Handles dark/light mode toggle with localStorage persistence.
 * Include this script on every page, right before </body>.
 */

(function () {
    'use strict';

    const STORAGE_KEY = 'aaa-theme';
    const DARK = 'dark';
    const LIGHT = 'light';

    /* ── 1. Apply theme immediately (prevents flash) ── */
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
    }

    /* ── 2. Read saved preference or default to dark ── */
    function getSavedTheme() {
        return localStorage.getItem(STORAGE_KEY) || DARK;
    }

    /* ── 3. Save preference ── */
    function saveTheme(theme) {
        localStorage.setItem(STORAGE_KEY, theme);
    }

    /* ── 4. Update the toggle button appearance ── */
    function updateToggleButton(theme) {
        const btn = document.getElementById('themeToggleBtn');
        if (!btn) return;

        const icon = btn.querySelector('.toggle-icon');
        const label = btn.querySelector('.toggle-label');

        if (theme === LIGHT) {
            if (icon) icon.textContent = '🌙';
            if (label) label.textContent = 'Dark';
            btn.title = 'Switch to dark mode';
        } else {
            if (icon) icon.textContent = '☀️';
            if (label) label.textContent = 'Light';
            btn.title = 'Switch to light mode';
        }
    }

    /* ── 5. Toggle between themes ── */
    function toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme') || DARK;
        const next = current === DARK ? LIGHT : DARK;

        applyTheme(next);
        saveTheme(next);
        updateToggleButton(next);

        /* Animate smooth background transition */
        document.body.style.transition = 'background-color 0.35s ease, color 0.35s ease';
        setTimeout(() => {
            document.body.style.transition = '';
        }, 400);
    }

    /* ── 6. Inject toggle button into the header ── */
    function injectToggleButton() {
        /* Avoid duplicates */
        if (document.getElementById('themeToggleBtn')) return;

        const btn = document.createElement('button');
        btn.id = 'themeToggleBtn';
        btn.className = 'theme-toggle';
        btn.setAttribute('aria-label', 'Toggle theme');
        btn.innerHTML = '<span class="toggle-icon">☀️</span><span class="toggle-label">Light</span>';
        btn.addEventListener('click', toggleTheme);

        /* Insert into .header-actions, right after the WhatsApp button */
        const headerActions = document.querySelector('.header-actions');
        if (headerActions) {
            headerActions.appendChild(btn);
        }
    }

    /* ── 7. Init on DOM ready ── */
    function init() {
        const saved = getSavedTheme();
        applyTheme(saved);
        injectToggleButton();
        updateToggleButton(saved);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    /* ── 8. Apply theme immediately for html element (flash prevention) ── */
    applyTheme(getSavedTheme());

})();
