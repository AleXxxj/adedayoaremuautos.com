(function(){
'use strict';
var K='aaa-theme',D='dark',L='light';
function applyTheme(t){document.documentElement.setAttribute('data-theme',t);}
function getSaved(){return localStorage.getItem(K)||D;}
function saveTheme(t){localStorage.setItem(K,t);}
function updateAllIcons(theme){
  var icons=document.querySelectorAll('.aaa-ti');
  for(var i=0;i<icons.length;i++){icons[i].textContent=theme===L?'🌙':'☀️';}
  var btns=document.querySelectorAll('.aaa-theme-btn');
  for(var j=0;j<btns.length;j++){btns[j].title=theme===L?'Switch to dark mode':'Switch to light mode';}
}
function toggleTheme(){
  var cur=document.documentElement.getAttribute('data-theme')||D;
  var next=cur===D?L:D;
  applyTheme(next);saveTheme(next);updateAllIcons(next);
  document.body.style.transition='background-color 0.35s ease,color 0.35s ease';
  setTimeout(function(){document.body.style.transition='';},420);
}
function buildFloatingPill(){
  var old=document.getElementById('aaaNavPill');
  if(old)old.remove();
  var waAnchor=document.querySelector('.header-actions .whatsapp-btn');
  var waHref=waAnchor?waAnchor.getAttribute('href'):'https://wa.me/2348012345678';
  var pill=document.createElement('div');
  pill.id='aaaNavPill';pill.className='aaa-nav-pill';
  var waBtn=document.createElement('a');
  waBtn.href=waHref;waBtn.target='_blank';waBtn.className='aaa-pill-wa';
  waBtn.setAttribute('aria-label','Chat on WhatsApp');
  waBtn.innerHTML='<i class="fab fa-whatsapp"></i>';
  var themeBtn=document.createElement('button');
  themeBtn.className='aaa-theme-btn aaa-pill-theme';
  themeBtn.innerHTML='<span class="aaa-ti">\u2600\ufe0f</span>';
  themeBtn.addEventListener('click',function(e){e.stopPropagation();toggleTheme();});
  pill.appendChild(waBtn);pill.appendChild(themeBtn);
  document.body.appendChild(pill);
}
function hookMobileNav(){
  var navMenu=document.getElementById('navMenu');
  if(!navMenu)return;
  var observer=new MutationObserver(function(){
    var pill=document.getElementById('aaaNavPill');
    if(!pill)return;
    var isOpen=navMenu.classList.contains('active');
    if(isOpen){pill.classList.add('aaa-pill-visible');}
    else{pill.classList.remove('aaa-pill-visible');}
  });
  observer.observe(navMenu,{attributes:true,attributeFilter:['class']});
}
function fixGeoPopup(){
  var notification=document.getElementById('countryNotification');
  if(!notification)return;
  var stored=localStorage.getItem('currencyChoice');
  if(stored==='dismissed'||stored==='accepted')return;
  if(localStorage.getItem('manualCurrency'))return;
  var ctrl=new AbortController();
  var timeout=setTimeout(function(){ctrl.abort();},7000);
  fetch('https://ipapi.co/json/',{signal:ctrl.signal})
    .then(function(r){return r.json();})
    .then(function(data){
      clearTimeout(timeout);
      var country=(data.country_name||'').trim();
      var cc=(data.country_code||'').trim();
      if(!country||!cc||cc==='NG')return;
      var currency='NGN',symbol='\u20a6',code='NGN';
      if(cc==='US'){currency='USD';symbol='$';code='USD';}
      else if(cc==='GB'){currency='GBP';symbol='\u00a3';code='GBP';}
      else if(['DE','FR','IT','ES','NL','BE','AT','PT','GR','FI','IE'].indexOf(cc)!==-1){currency='EUR';symbol='\u20ac';code='EUR';}
      var s=function(id,val){var el=document.getElementById(id);if(el)el.textContent=val;};
      s('userCountry',country);s('userCurrency',symbol+' '+code);s('switchCurrencyCode',code);
      notification.style.display='block';
      localStorage.setItem('detectedCurrency',currency);
      localStorage.setItem('detectedSymbol',symbol);
    })
    .catch(function(){clearTimeout(timeout);});
}
function injectStyles(){
  if(document.getElementById('aaaThemeCSS'))return;
  var css=[
    '.aaa-header-toggle{display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:50%;background:transparent;border:1.5px solid rgba(255,255,255,0.18);cursor:pointer;font-size:19px;flex-shrink:0;padding:0;line-height:1;transition:all 0.25s ease;margin-left:8px;}',
    '.aaa-header-toggle:hover{border-color:#39B54A;background:rgba(57,181,74,0.12);transform:scale(1.08);}',
    '[data-theme="light"] .aaa-header-toggle{border-color:rgba(0,0,0,0.15);background:#FFFFFF;box-shadow:0 1px 6px rgba(0,0,0,0.10);}',
    '[data-theme="light"] .aaa-header-toggle:hover{border-color:#39B54A;background:rgba(57,181,74,0.08);}',
    '@media (max-width:900px){.header-actions .whatsapp-btn{display:none !important;}.aaa-header-toggle{width:40px;height:40px;font-size:18px;margin-left:6px;}}',
    '.aaa-nav-pill{position:fixed;bottom:330px;right:16px;display:flex;flex-direction:row;gap:10px;align-items:center;z-index:1050;opacity:0;transform:translateY(10px) scale(0.92);pointer-events:none;transition:opacity 0.28s ease,transform 0.28s ease;}',
    '.aaa-nav-pill.aaa-pill-visible{opacity:1;transform:translateY(0) scale(1);pointer-events:all;}',
    '.aaa-pill-wa{display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;background:#25D366;border-radius:50%;color:#FFFFFF;font-size:22px;text-decoration:none;box-shadow:0 4px 14px rgba(37,211,102,0.40);transition:all 0.25s ease;flex-shrink:0;}',
    '.aaa-pill-wa:hover{background:#128C7E;transform:scale(1.08);}',
    '.aaa-pill-theme{display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;background:#1A1A1A;border:1.5px solid #3A3A3A;border-radius:50%;font-size:21px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,0.35);transition:all 0.25s ease;flex-shrink:0;padding:0;line-height:1;}',
    '.aaa-pill-theme:hover{border-color:#39B54A;transform:scale(1.08);}',
    '[data-theme="light"] .aaa-pill-theme{background:#FFFFFF;border-color:#DDDDDD;box-shadow:0 4px 14px rgba(0,0,0,0.12);}',
    '[data-theme="light"] .aaa-pill-theme:hover{border-color:#39B54A;}',
    '@media (min-width:901px){.aaa-nav-pill{display:none !important;}}'
  ].join('');
  var s=document.createElement('style');
  s.id='aaaThemeCSS';
  s.appendChild(document.createTextNode(css));
  document.head.appendChild(s);
}
function init(){
  var saved=getSaved();
  applyTheme(saved);injectStyles();
  buildFloatingPill();hookMobileNav();updateAllIcons(saved);fixGeoPopup();
}
applyTheme(getSaved());
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init);}
else{init();}
})();
