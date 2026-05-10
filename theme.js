/**
 * ADEDAYO AREMU AUTOS — THEME SWITCHER v3
 *
 * Mobile strategy:
 *   - Desktop (>900px): theme toggle sits in .header-actions alongside WhatsApp btn
 *   - Mobile (≤900px): WhatsApp btn is HIDDEN from header-actions (display:none via CSS)
 *                      Theme toggle replaces it in header (icon only, no label)
 *                      When nav opens: floating pill (WhatsApp + theme toggle) appears bottom-right
 *
 * Include: <script src="theme.js"></script> before </body> on every page.
 */

(function () {
    'use strict';

    const STORAGE_KEY = 'aaa-theme';
    const DARK  = 'dark';
    const LIGHT = 'light';

    /* ─── Theme helpers ─────────────────────────────── */
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
    }
    function getSaved()   { return localStorage.getItem(STORAGE_KEY) || DARK; }
    function saveTheme(t) { localStorage.setItem(STORAGE_KEY, t); }

    function updateAllToggles(theme) {
        document.querySelectorAll('.aaa-theme-btn').forEach(btn => {
            const icon  = btn.querySelector('.ti');
            const label = btn.querySelector('.tl');
            if (theme === LIGHT) {
                if (icon)  icon.textContent  = '🌙';
                if (label) label.textContent = 'Dark';
                btn.title = 'Switch to dark mode';
            } else {
                if (icon)  icon.textContent  = '☀️';
                if (label) label.textContent = 'Light';
                btn.title = 'Switch to light mode';
            }
        });
    }

    function toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme') || DARK;
        const next = current === DARK ? LIGHT : DARK;
        applyTheme(next);
        saveTheme(next);
        updateAllToggles(next);
        document.body.style.transition = 'background-color 0.35s ease, color 0.35s ease';
        setTimeout(() => { document.body.style.transition = ''; }, 420);
    }

    /* ─── Build a theme button ──────────────────────── */
    function makeThemeBtn(extraClass, showLabel) {
        const btn = document.createElement('button');
        btn.className = 'aaa-theme-btn ' + (extraClass || '');
        btn.setAttribute('aria-label', 'Toggle colour theme');
        btn.innerHTML =
            '<span class="ti">☀️</span>' +
            (showLabel ? '<span class="tl">Light</span>' : '');
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleTheme();
        });
        return btn;
    }

    /* ─── Inject header toggle (replaces WhatsApp on mobile) ── */
    function injectHeaderToggle() {
        if (document.getElementById('headerThemeToggle')) return;

        const btn = makeThemeBtn('header-theme-toggle', false);
        btn.id = 'headerThemeToggle';

        const actions = document.querySelector('.header-actions');
        if (actions) {
            // Insert BEFORE the WhatsApp button so it sits left of it on desktop
            const waBtn = actions.querySelector('.whatsapp-btn');
            if (waBtn) {
                actions.insertBefore(btn, waBtn);
            } else {
                actions.appendChild(btn);
            }
        }
    }

    /* ─── Floating nav pill (WhatsApp + theme) ────────
       Appears bottom-right when mobile nav is open      */
    function createNavPill() {
        if (document.getElementById('navFloatPill')) return;

        // Find the original WhatsApp href
        const waHref = (function() {
            const a = document.querySelector('.header-actions .whatsapp-btn');
            return a ? a.href : 'https://wa.me/2348012345678';
        })();

        const pill = document.createElement('div');
        pill.id = 'navFloatPill';
        pill.className = 'nav-float-pill';
        pill.innerHTML =
            '<a href="' + waHref + '" target="_blank" class="pill-wa" aria-label="WhatsApp">' +
                '<i class="fab fa-whatsapp"></i>' +
            '</a>';

        const themeBtn = makeThemeBtn('pill-theme', false);
        pill.appendChild(themeBtn);

        document.body.appendChild(pill);
    }

    /* ─── Hook into existing mobile menu toggle ────── */
    function hookMobileMenu() {
        const menuBtn = document.getElementById('mobileMenuBtn');
        const navMenu = document.getElementById('navMenu');
        if (!menuBtn || !navMenu) return;

        // Watch nav open/close via class mutation
        const observer = new MutationObserver(function() {
            const pill = document.getElementById('navFloatPill');
            if (!pill) return;
            if (navMenu.classList.contains('active')) {
                pill.classList.add('visible');
            } else {
                pill.classList.remove('visible');
            }
        });
        observer.observe(navMenu, { attributes: true, attributeFilter: ['class'] });
    }

    /* ─── Fix geo-detection popup blank country bug ── */
    function fixGeoPopup() {
        const notification = document.getElementById('countryNotification');
        if (!notification) return;

        const currencyChoice = localStorage.getItem('currencyChoice');
        if (currencyChoice === 'dismissed' || currencyChoice === 'accepted') return;

        // Use a more reliable IP geolocation API with timeout
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);

        fetch('https://ipapi.co/json/', { signal: controller.signal })
            .then(r => r.json())
            .then(data => {
                clearTimeout(timeout);
                const country     = data.country_name || '';
                const countryCode = data.country_code  || '';
                if (!country || !countryCode) return;

                let currency = 'NGN', symbol = '₦', code = 'NGN';
                if      (countryCode === 'US') { currency = 'USD'; symbol = '$';  code = 'USD'; }
                else if (countryCode === 'GB') { currency = 'GBP'; symbol = '£';  code = 'GBP'; }
                else if (['DE','FR','IT','ES','NL','BE','AT','PT','GR','FI','IE'].includes(countryCode))
                                               { currency = 'EUR'; symbol = '€';  code = 'EUR'; }

                if (countryCode !== 'NG' && !localStorage.getItem('manualCurrency')) {
                    const elCountry   = document.getElementById('userCountry');
                    const elCurrency  = document.getElementById('userCurrency');
                    const elSwitch    = document.getElementById('switchCurrencyCode');
                    if (elCountry)  elCountry.textContent  = country;
                    if (elCurrency) elCurrency.textContent = symbol + ' ' + code;
                    if (elSwitch)   elSwitch.textContent   = code;
                    notification.style.display = 'block';
                    localStorage.setItem('detectedCurrency', currency);
                    localStorage.setItem('detectedSymbol',   symbol);
                }
            })
            .catch(() => { clearTimeout(timeout); });
    }

    /* ─── Inject all CSS ───────────────────────────── */
    function injectStyles() {
        if (document.getElementById('aaaThemeStyles')) return;

        const style = document.createElement('style');
        style.id = 'aaaThemeStyles';
        style.textContent = `

/* ══ Header theme toggle button ══════════════════ */
.header-theme-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 42px;
    background: transparent;
    border: 1.5px solid rgba(255,255,255,0.15);
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.25s ease;
    font-size: 18px;
    flex-shrink: 0;
    margin-left: 8px;
    line-height: 1;
    padding: 0;
}
.header-theme-toggle:hover {
    border-color: #39B54A;
    background: rgba(57,181,74,0.10);
    transform: scale(1.08);
}
[data-theme="light"] .header-theme-toggle {
    border-color: rgba(0,0,0,0.15);
    background: #FFFFFF;
    box-shadow: 0 1px 6px rgba(0,0,0,0.10);
}
[data-theme="light"] .header-theme-toggle:hover {
    border-color: #39B54A;
    background: rgba(57,181,74,0.08);
}

/* ══ Hide WhatsApp btn on mobile (≤900px) ═════════
   The pill handles it when nav opens              */
@media (max-width: 900px) {
    .header-actions .whatsapp-btn {
        display: none !important;
    }
    /* Keep toggle visible and properly sized */
    .header-theme-toggle {
        width: 40px;
        height: 40px;
        font-size: 17px;
        margin-left: 6px;
    }
}

/* ══ Floating pill (nav open state) ══════════════ */
.nav-float-pill {
    position: fixed;
    bottom: 281.5px;
    right: 16px;
    display: flex;
    flex-direction: row;
    gap: 10px;
    align-items: center;
    z-index: 1100;
    opacity: 0;
    transform: translateY(12px);
    pointer-events: none;
    transition: opacity 0.28s ease, transform 0.28s ease;
}
.nav-float-pill.visible {
    opacity: 1;
    transform: translateY(0);
    pointer-events: all;
}

/* WA button inside pill */
.nav-float-pill .pill-wa {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    background: #25D366;
    border-radius: 50%;
    color: #FFFFFF;
    font-size: 22px;
    text-decoration: none;
    box-shadow: 0 4px 14px rgba(37,211,102,0.40);
    transition: all 0.25s ease;
    flex-shrink: 0;
}
.nav-float-pill .pill-wa:hover {
    background: #128C7E;
    transform: scale(1.08);
}

/* Theme button inside pill */
.nav-float-pill .pill-theme {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    background: #1A1A1A;
    border: 1.5px solid #3A3A3A;
    border-radius: 50%;
    font-size: 20px;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(0,0,0,0.35);
    transition: all 0.25s ease;
    flex-shrink: 0;
    padding: 0;
}
.nav-float-pill .pill-theme:hover {
    border-color: #39B54A;
    transform: scale(1.08);
}
[data-theme="light"] .nav-float-pill .pill-theme {
    background: #FFFFFF;
    border-color: #DDDDDD;
    box-shadow: 0 4px 14px rgba(0,0,0,0.12);
}

/* Only show pill on mobile */
@media (min-width: 901px) {
    .nav-float-pill { display: none !important; }
}

        `;
        document.head.appendChild(style);
    }

    /* ─── Init ──────────────────────────────────────── */
    function init() {
        const saved = getSaved();
        applyTheme(saved);
        injectStyles();
        injectHeaderToggle();
        createNavPill();
        hookMobileMenu();
        updateAllToggles(saved);
        fixGeoPopup();
    }

    // Apply theme immediately (no flash)
    applyTheme(getSaved());

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
