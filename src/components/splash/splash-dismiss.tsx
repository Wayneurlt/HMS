"use client";

import { useEffect } from "react";

const HOLD_MS = 250; // brief pause on the finished logo before fading
const MAX_WAIT_MS = 2500; // never keep the app waiting longer than this

/**
 * Fades the splash out once the page has loaded and the logo has finished drawing.
 * Waits on the splash's own CSS animations (not a fixed delay), so the mark always
 * completes however long the first paint took. Reduced motion has no animations,
 * so it dismisses as soon as the page is ready.
 */
export function SplashDismiss() {
  useEffect(() => {
    const root = document.documentElement;
    const splash = document.getElementById("splash");
    if (root.dataset.splash === "off" || !splash) return;

    let cancelled = false;
    let holdTimer: number | undefined;
    const dismiss = () => {
      if (!cancelled) root.setAttribute("data-splash", "done");
    };
    const capTimer = window.setTimeout(dismiss, MAX_WAIT_MS);

    const pageLoaded =
      document.readyState === "complete"
        ? Promise.resolve()
        : new Promise<void>((resolve) => window.addEventListener("load", () => resolve(), { once: true }));
    // Finite intro animations only: skip the looping loading bar and the CSS failsafe fade-out.
    const intro = splash
      .getAnimations({ subtree: true })
      .filter((a) => a.effect?.getTiming().iterations !== Infinity && (a as CSSAnimation).animationName !== "splash-out")
      .map((a) => a.finished.catch(() => undefined));

    Promise.all([pageLoaded, ...intro]).then(() => {
      holdTimer = window.setTimeout(dismiss, HOLD_MS);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(capTimer);
      if (holdTimer) window.clearTimeout(holdTimer);
    };
  }, []);
  return null;
}
