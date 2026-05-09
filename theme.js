/**

- ADEDAYO AREMU AUTOS — THEME SWITCHER v5 (FINAL)
- 
- Mobile (≤900px):
- Header: [Logo] [Hamburger] [Theme ☀️]   ← WA hidden from header
- Nav open: floating pill bottom-right → [WA 💬] [Theme ☀️]
- 
- Desktop (>900px):
- Header: [Logo] [Nav] [WA btn] [Theme ☀️]
- No floating pill.
  */

(function () {
‘use strict’;

const STORAGE_KEY = 'aaa-theme';
const DARK  = 'dark';
const LIGHT = 'light';

function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
}
function getSaved()   { return localStorage.getItem(STORAGE_KEY) || DARK; }
function saveTheme(t) { localStorage.setItem(STORAGE_KEY, t); }

function updateAllIcons(theme) {
    document.querySelectorAll('.aaa-ti').forEach(function(el) {
        el.textContent = theme === LIGHT ? '🌙' : '☀️';
    });
    document.querySelectorAll('.aaa-theme-btn').forEach(function(btn) {
        btn.title = theme === LIGHT ? 'Switch to dark mode' : 'Switch to light mode';
    });
}

function toggleTheme() {
    const cur  = document.documentElement.getAttribute('data-theme') || DARK;
    const next = cur === DARK ? LIGHT : DARK;
    applyTheme(next);
    saveTheme(next);
    updateAllIcons(next);
    document.body.style.transition = 'background-color 0.35s ease, color 0.35s ease';
    setTimeout(function() { document.body.style.transition = ''; }, 420);
}

/* ── 1. Header toggle button ── */
function injectHeaderToggle() {
    if (document.getElementById('aaaHeaderToggle')) return;

    const btn = document.createElement('button');
    btn.id        = 'aaaHeaderToggle';
    btn.className = 'aaa-theme-btn aaa-header-toggle';
    btn.innerHTML = '<span class="aaa-ti">☀️</span>';
    btn.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleTheme();
    });

    const actions = document.querySelector('.header-actions');
    if (!actions) return;
    const wa = actions.querySelector('.whatsapp-btn');
    if (wa) {
        actions.insertBefore(btn, wa);
    } else {
        actions.appendChild(btn);
    }
}

/* ── 2. Floating pill: WA + Theme ── */
function buildFloatingPill() {
    const existing = document.getElementById('aaaNavPill');
    if (existing) existing.remove();

    const waAnchor = document.querySelector('.header-actions .whatsapp-btn');
    const waHref   = waAnchor ? waAnchor.getAttribute('href') : 'https://wa.me/2348012345678';

    const pill = document.createElement('div');
    pill.id        = 'aaaNavPill';
    pill.className = 'aaa-nav-pill';

    // WhatsApp circle button
    const waBtn = document.createElement('a');
    waBtn.href      = waHref;
    waBtn.target    = '_blank';
    waBtn.className = 'aaa-pill-wa';
    waBtn.setAttribute('aria-label', 'Chat on WhatsApp');
    waBtn.innerHTML = '<i class="fab fa-whatsapp"></i>';

    // Theme toggle circle button
    const themeBtn = document.createElement('button');
    themeBtn.className = 'aaa-theme-btn aaa-pill-theme';
    themeBtn.innerHTML = '<span class="aaa-ti">☀️</span>';
    themeBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleTheme();
    });

    pill.appendChild(waBtn);
    pill.appendChild(themeBtn);
    document.body.appendChild(pill);
}

/* ── 3. Show/hide pill when nav opens/closes ── */
function hookMobileNav() {
    const navMenu = document.getElementById('navMenu');
    if (!navMenu) return;

    const observer = new MutationObserver(function() {
        const pill = document.getElementById('aaaNavPill');
        if (!pill) return;
        const isOpen = navMenu.classList.contains('active');
        pill.classList.toggle('aaa-pill-visible', isOpen);
    });
    observer.observe(navMenu, { attributes: true, attributeFilter: ['class'] });
}

/* ── 4. Fix geo-detection popup blank country ── */
function fixGeoPopup() {
    const notification = document.getElementById('countryNotification');
    if (!notification) return;
    const stored = localStorage.getItem('currencyChoice');
    if (stored === 'dismissed' || stored === 'accepted') return;
    if (localStorage.getItem('manualCurrency')) return;

    const ctrl    = new AbortController();
    const timeout = setTimeout(function() { ctrl.abort(); }, 7000);

    fetch('https://ipapi.co/json/', { signal: ctrl.signal })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            clearTimeout(timeout);
            const country     = (data.country_name || '').trim();
            const countryCode = (data.country_code  || '').trim();
            if (!country || !countryCode || countryCode === 'NG') return;

            let currency = 'NGN', symbol = '₦', code = 'NGN';
            if      (countryCode === 'US') { currency='USD'; symbol='$';  code='USD'; }
            else if (countryCode === 'GB') { currency='GBP'; symbol='£';  code='GBP'; }
            else if (['DE','FR','IT','ES','NL','BE','AT','PT','GR','FI','IE'].includes(countryCode))
                                           { currency='EUR'; symbol='€';  code='EUR'; }

            const setEl = function(id, val) {
                const el = document.getElementById(id);
                if (el) el.textContent = val;
            };
            setEl('userCountry',        country);
            setEl('userCurrency',       symbol + ' ' + code);
            setEl('switchCurrencyCode', code);

            notification.style.display = 'block';
            localStorage.setItem('detectedCurrency', currency);
            localStorage.setItem('detectedSymbol',   symbol);
        })
        .catch(function() { clearTimeout(timeout); });
}

/* ── 5. Inject CSS ── */
function injectStyles() {
    if (document.getElementById('aaaThemeCSS')) return;

    const style = document.createElement('style');
    style.id = 'aaaThemeCSS';
    style.textContent = `
```

/* ═══ HEADER THEME TOGGLE ════════════════════════ */
.aaa-header-toggle {
display: inline-flex;
align-items: center;
justify-content: center;
width: 42px;
height: 42px;
border-radius: 50%;
background: transparent;
border: 1.5px solid rgba(255,255,255,0.18);
cursor: pointer;
font-size: 19px;
flex-shrink: 0;
padding: 0;
line-height: 1;
transition: all 0.25s ease;
margin-left: 8px;
}
.aaa-header-toggle:hover {
border-color: #39B54A;
background: rgba(57,181,74,0.12);
transform: scale(1.08);
}
[data-theme=“light”] .aaa-header-toggle {
border-color: rgba(0,0,0,0.15);
background: #FFFFFF;
box-shadow: 0 1px 6px rgba(0,0,0,0.10);
}
[data-theme=“light”] .aaa-header-toggle:hover {
border-color: #39B54A;
background: rgba(57,181,74,0.08);
}

/* ═══ HIDE WA BTN IN HEADER ON MOBILE ═══════════
Header becomes: [Logo] [Hamburger ☰] [Theme ☀️]  */
@media (max-width: 900px) {
.header-actions .whatsapp-btn {
display: none !important;
}
.aaa-header-toggle {
width: 40px;
height: 40px;
font-size: 18px;
margin-left: 6px;
}
}

/* ═══ FLOATING PILL (mobile, nav-open only) ══════
Position: bottom-right, above “Chat with us”    */
.aaa-nav-pill {
position: fixed;
bottom: 82px;
right: 16px;
display: flex;
flex-direction: row;
gap: 10px;
align-items: center;
z-index: 1050;
opacity: 0;
transform: translateY(10px) scale(0.92);
pointer-events: none;
transition: opacity 0.28s ease, transform 0.28s ease;
}
.aaa-nav-pill.aaa-pill-visible {
opacity: 1;
transform: translateY(0) scale(1);
pointer-events: all;
}

/* WhatsApp circle in pill */
.aaa-pill-wa {
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
.aaa-pill-wa:hover {
background: #128C7E;
transform: scale(1.08);
}

/* Theme circle in pill */
.aaa-pill-theme {
display: inline-flex;
align-items: center;
justify-content: center;
width: 48px;
height: 48px;
background: #1A1A1A;
border: 1.5px solid #3A3A3A;
border-radius: 50%;
font-size: 21px;
cursor: pointer;
box-shadow: 0 4px 14px rgba(0,0,0,0.35);
transition: all 0.25s ease;
flex-shrink: 0;
padding: 0;
line-height: 1;
}
.aaa-pill-theme:hover {
border-color: #39B54A;
transform: scale(1.08);
}
[data-theme=“light”] .aaa-pill-theme {
background: #FFFFFF;
border-color: #DDDDDD;
box-shadow: 0 4px 14px rgba(0,0,0,0.12);
}
[data-theme=“light”] .aaa-pill-theme:hover {
border-color: #39B54A;
}

/* Hide pill on desktop */
@media (min-width: 901px) {
.aaa-nav-pill { display: none !important; }
}

```
    `;
    document.head.appendChild(style);
}

/* ── 6. Init ── */
function init() {
    const saved = getSaved();
    applyTheme(saved);
    injectStyles();
    injectHeaderToggle();
    buildFloatingPill();
    hookMobileNav();
    updateAllIcons(saved);
    fixGeoPopup();
}

applyTheme(getSaved()); // immediate — no flash
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

})();
