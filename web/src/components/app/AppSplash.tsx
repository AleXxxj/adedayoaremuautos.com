/**
 * The splash: the name, and a slim moving line, while the first screen loads.
 *
 * Shown only when the site runs as an installed app (from the home screen, or
 * inside the Android app), and only once per session. In a browser tab it is
 * never shown: a website that covers itself with a logo is just slower.
 *
 * The decision is made by a small script that runs before the page paints,
 * because only the browser knows whether it is running as an app. The script
 * sets `data-splash` on <html>, the stylesheet (app-shell.css) does the rest,
 * and the script takes the splash away as soon as the page's HTML has all
 * arrived. A six-second limit means it can never get stuck in front of the
 * page. With scripts off it never appears.
 *
 * The Android app shows its own splash first (same background, the icon);
 * this one carries on from it, so the two read as one.
 */
const SCRIPT = `(function(){try{var m=window.matchMedia,a=m("(display-mode: standalone)").matches||m("(display-mode: fullscreen)").matches||navigator.standalone===true;if(!a||sessionStorage.getItem("aaa:splash"))return;sessionStorage.setItem("aaa:splash","1");var h=document.documentElement,d=0;h.setAttribute("data-splash","on");function o(){if(d)return;d=1;h.setAttribute("data-splash","out");setTimeout(function(){h.removeAttribute("data-splash")},280)}document.addEventListener("DOMContentLoaded",function(){requestAnimationFrame(o)});setTimeout(o,6000)}catch(e){}})()`;

export function AppSplash() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
      <div className="app-splash" aria-hidden="true">
        <p className="app-splash-name">
          ADEDAYO AREMU <span>AUTOS</span>
        </p>
        <div className="app-splash-line" />
      </div>
    </>
  );
}
