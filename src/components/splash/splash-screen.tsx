import { APP_NAME } from "@/lib/brand";
import { SplashDismiss } from "./splash-dismiss";

/**
 * Launch splash: the Masqani mark draws itself while the app loads, then fades away.
 * Rendered in the initial HTML so it covers the very first paint. Shown once per browser
 * session (opening the app or site); the inline script in the root layout hides it for
 * later page loads in the same session. CSS also fades it out after a few seconds as a
 * failsafe, so it can never get stuck.
 */
export function SplashScreen() {
  return (
    <div id="splash" aria-hidden="true">
      <div className="splash-inner">
        <svg className="splash-mark" viewBox="0 0 100 100" width="112" height="112" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="50" cy="50" r="50" className="splash-disc" />
          <g transform="translate(50 50) scale(0.8) translate(-50 -50)" stroke="currentColor">
            <path className="splash-ring" pathLength={1} d="M 50 6 a 44 44 0 1 1 0 88 a 44 44 0 1 1 0 -88" strokeWidth="3" />
            <path className="splash-tick splash-tick-1" pathLength={1} d="M 27 10.2 A 46 46 0 0 1 46 4.2" strokeWidth="1.2" />
            <path className="splash-tick splash-tick-2" pathLength={1} d="M 73 10.2 A 46 46 0 0 1 89.8 27" strokeWidth="1.2" />
            <path
              className="splash-m"
              pathLength={1}
              d="M 28.5 64 C 29.5 52 31 39 33.8 33.2 C 35.5 30.5 37.5 33 39.5 40 C 41.5 47 43 56 45.3 60 C 47 62.5 49 59 52 51 C 56 40 60.5 30 63.8 28.2 C 65.5 27.5 64.8 34 63.5 44 C 62 56 60 68 58.6 77.6"
              strokeWidth="4.5"
            />
          </g>
        </svg>
        <p className="splash-word">{APP_NAME}</p>
        <div className="splash-bar">
          <span />
        </div>
      </div>
      <SplashDismiss />
    </div>
  );
}

/** Runs before first paint: show the splash only on the first load of a browser session. */
export const SPLASH_BOOT_SCRIPT = `(function(){try{var d=document.documentElement;if(navigator.webdriver){d.setAttribute('data-splash','off');return;}if(sessionStorage.getItem('masqani-splash')){d.setAttribute('data-splash','off');}else{sessionStorage.setItem('masqani-splash','1');}}catch(e){}})();`;
