/**

- ADEDAYO AREMU AUTOS — THEME SWITCHER v5
- Mobile: header has [Logo][Hamburger][ThemeToggle], WA hidden.
- When nav opens: floating pill bottom-right with [WA][Theme].
  */

(function () {
‘use strict’;

var STORAGE_KEY = 'aaa-theme';
var DARK = 'dark';
var LIGHT = 'light';

function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
}
function getSaved() {
    return localStorage.getItem(STORAGE_KEY) || DARK;
}
function saveTheme(t) {
    localStorage.setItem(STORAGE_KEY, t);
}

function updateAllIcons(theme) {
    var icons = document.querySelectorAll('.aaa-ti');
    for (var i = 0; i < icons.length; i++) {
        icons[i].textContent = theme === LIGHT ? '🌙' : '☀️';
    }
    var btns = document.querySelectorAll('.aaa-theme-btn');
    for (var j = 0; j < btns.length; j++) {
        btns[j].title = theme === LIGHT ? 'Switch to dark mode' : 'Switch to light mode';
    }
}

function toggleTheme() {
    var cur = document.documentElement.getAttribute('data-theme') || DARK;
    var next = cur === DARK ? LIGHT : DARK;
    applyTheme(next);
    saveTheme(next);
    updateAllIcons(next);
    document.body.style.transition = 'background-color 0.35s ease, color 0.35s ease';
    setTimeout(function () {
        document.body.style.transition = '';
    }, 420);
}

function injectHeaderToggle() {
    if (document.getElementById('aaaHeaderToggle')) return;
    var btn = document.createElement('button');
    btn.id = 'aaaHeaderToggle';
    btn.className = 'aaa-theme-btn aaa-header-toggle';
    btn.innerHTML = '<span class="aaa-ti">☀️</span>';
    btn.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleTheme();
    });

    var actions = document.querySelector('.header-actions');
    if (!actions) return;
    var wa = actions.querySelector('.whatsapp-btn');
    if (wa) {
        actions.insertBefore(btn, wa);
    } else {
        actions.appendChild(btn);
    }
}

function buildFloatingPill() {
    var old = document.getElementById('aaaNavPill');
    if (old) old.remove();

    var waAnchor = document.querySelector('.header-actions .whatsapp-btn');
    var waHref = waAnchor ? waAnchor.getAttribute('href') : 'https://wa.me/2348012345678';

    var pill = document.createElement('div');
    pill.id = 'aaaNavPill';
    pill.className = 'aaa-nav-pill';

    var waBtn = document.createElement('a');
    waBtn.href = waHref;
    waBtn.target = '_blank';
    waBtn.className = 'aaa-nav-pill-wa';
    waBtn.setAttribute('aria-label', 'Chat on WhatsApp');
    waBtn.innerHTML = '<i class="fab fa-whatsapp"></i>';

    var themeBtn = document.createElement('button');
    themeBtn.className = 'aaa-theme-btn aaa-nav-pill-theme';
    themeBtn.innerHTML = '<span class="aaa-ti">☀️</span>';
    themeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleTheme();
    });

    pill.appendChild(waBtn);
    pill.appendChild(themeBtn);
    document.body.appendChild(pill);
}

function hookMobileNav() {
    var menuBtn = document.getElementById('mobileMenuBtn');
    var navMenu = document.getElementById('navMenu');
    if (!menuBtn || !navMenu) return;

    var observer = new MutationObserver(function () {
        var pill = document.getElementById('aaaNavPill');
        if (!pill) return;
        var isOpen = navMenu.classList.contains('active');
        if (isOpen) {
            pill.classList.add('aaa-pill-visible');
        } else {
            pill.classList.remove('aaa-pill-visible');
        }
    });
    observer.observe(navMenu, { attributes: true, attributeFilter: ['class'] });
}

function fixGeoPopup() {
    var notification = document.getElementById('countryNotification');
    if (!notification) return;
    var stored = localStorage.getItem('currencyChoice');
    if (stored === 'dismissed' || stored === 'accepted') return;
    if (localStorage.getItem('manualCurrency')) return;

    var ctrl = new AbortController();
    var timeout = setTimeout(function () { ctrl.abort(); }, 7000);

    fetch('https://ipapi.co/json/', { signal: ctrl.signal })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            clearTimeout(timeout);
            var country = (data.country_name || '').trim();
            var countryCode = (data.country_code || '').trim();
            if (!country || !countryCode || countryCode === 'NG') return;

            var currency = 'NGN', symbol = '₦', code = 'NGN';
            if (countryCode === 'US') { currency = 'USD'; symbol = '$'; code = 'USD'; }
            else if (countryCode === 'GB') { currency = 'GBP'; symbol = '£'; code = 'GBP'; }
            else if (['DE','FR','IT','ES','NL','BE','AT','PT','GR','FI','IE'].indexOf(countryCode) !== -1) {
                currency = 'EUR'; symbol = '€'; code = 'EUR';
            }

            var setEl = function (id, val) {
                var el = document.getElementById(id);
                if (el) el.textContent = val;
            };
            setEl('userCountry', country);
            setEl('userCurrency', symbol + ' ' + code);
            setEl('switchCurrencyCode', code);

            notification.style.display = 'block';
            localStorage.setItem('detectedCurrency', currency);
            localStorage.setItem('detectedSymbol', symbol);
        })
        .catch(function () { clearTimeout(timeout); });
}

function injectStyles() {
    if (document.getElementById('aaaThemeCSS')) return;

    var css = '';
    css += '.aaa-header-toggle{display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:50%;background:transparent;border:1.5px solid rgba(255,255,255,0.18);cursor:pointer;font-size:19px;flex-shrink:0;padding:0;line-height:1;transition:all 0.25s ease;margin-left:8px;}';
    css += '.aaa-header-toggle:hover{border-color:#39B54A;background:rgba(57,181,74,0.12);transform:scale(1.08);}';
    css += '[data-theme="light"] .aaa-header-toggle{border-color:rgba(0,0,0,0.15);background:#FFFFFF;box-shadow:0 1px 6px rgba(0,0,0,0.10);}';
    css += '[data-theme="light"] .aaa-header-toggle:hover{border-color:#39B54A;background:rgba(57,181,74,0.08);}';

    css += '@media (max-width:900px){.header-actions .whatsapp-btn{display:none !important;}.aaa-header-toggle{width:40px;height:40px;font-size:18px;margin-left:6px;}}';

    css += '.aaa-nav-pill{position:fixed;bottom:82px;right:16px;display:flex;flex-direction:row;gap:10px;align-items:center;z-index:1050;opacity:0;transform:translateY(10px) scale(0.92);pointer-events:none;transition:opacity 0.28s ease, transform 0.28s ease;}';
    css += '.aaa-nav-pill.aaa-pill-visible{opacity:1;transform:translateY(0) scale(1);pointer-events:all;}';

    css += '.aaa-nav-pill-wa{display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;background:#25D366;border-radius:50%;color:#FFFFFF;font-size:22px;text-decoration:none;box-shadow:0 4px 14px rgba(37,211,102,0.40);transition:all 0.25s ease;flex-shrink:0;}';
    css += '.aaa-nav-pill-wa:hover{background:#128C7E;transform:scale(1.08);}';

    css += '.aaa-nav-pill-theme{display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;background:#1A1A1A;border:1.5px solid #3A3A3A;border-radius:50%;font-size:21px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,0.35);transition:all 0.25s ease;flex-shrink:0;padding:0;line-height:1;}';
    css += '.aaa-nav-pill-theme:hover{border-color:#39B54A;transform:scale(1.08);}';
    css += '[data-theme="light"] .aaa-nav-pill-theme{background:#FFFFFF;border-color:#DDDDDD;box-shadow:0 4px 14px rgba(0,0,0,0.12);}';
    css += '[data-theme="light"] .aaa-nav-pill-theme:hover{border-color:#39B54A;}';

    css += '@media (min-width:901px){.aaa-nav-pill{display:none !important;}}';

    var s = document.createElement('style');
    s.id = 'aaaThemeCSS';
    s.appendChild(document.createTextNode(css));
    document.head.appendChild(s);
}

function init() {
    var saved = getSaved();
    applyTheme(saved);
    injectStyles();
    injectHeaderToggle();
    buildFloatingPill();
    hookMobileNav();
    updateAllIcons(saved);
    fixGeoPopup();
}

applyTheme(getSaved());

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
 
})();
