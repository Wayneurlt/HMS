"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, MonitorSmartphone, PlusSquare, Share, Smartphone, X, Zap } from "lucide-react";
import { APP_NAME } from "@/lib/brand";
import { buttonClass } from "@/components/ui/primitives";

/** Chromium's install event (not in the standard DOM typings yet). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "ios" | "android" | "desktop";

const DISMISS_KEY = "masqani-install-later"; // per browser session only

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (iOS) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

/**
 * Registers the service worker and keeps asking the user to install Masqani as an app:
 * a prompt sheet every time the app is opened in a browser, plus a floating "Install app"
 * button that stays until it's installed. Nothing shows once running as the installed app.
 */
export function InstallPrompt() {
  const [ready, setReady] = useState(false);
  const [installed, setInstalled] = useState(true);
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      if (process.env.NODE_ENV === "production") {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
      } else {
        // Dev: never let a service worker serve stale bundles.
        navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
      }
    }

    // Automated browsers (tests, crawlers) are not asked to install.
    const standalone = isStandalone() || navigator.webdriver === true;
    setInstalled(standalone);
    setPlatform(detectPlatform());
    setReady(true);
    if (standalone) return;

    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep it so our own button can show the browser's install dialog
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setOpen(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    let laterThisSession = false;
    try {
      laterThisSession = sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {}
    const timer = laterThisSession ? undefined : window.setTimeout(() => setOpen(true), 1200);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  const later = useCallback(() => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") later();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, later]);

  const install = async () => {
    if (!deferred) return;
    setBusy(true);
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === "accepted") {
        setInstalled(true);
        setOpen(false);
      }
    } finally {
      setDeferred(null); // a prompt event can only be used once
      setBusy(false);
    }
  };

  if (!ready || installed) return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="install-pill fixed bottom-4 left-1/2 z-[45] -translate-x-1/2 inline-flex h-11 items-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-accent-ink shadow-lg ring-1 ring-black/5"
        >
          <Download className="h-4 w-4" /> Install app
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="install-title">
          <div className="animate-fade absolute inset-0 bg-black/50" onClick={later} />
          <div className="animate-sheet relative w-full max-w-md rounded-t-3xl border border-line bg-card p-6 shadow-2xl sm:rounded-3xl">
            <button type="button" onClick={later} className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full text-ink-3 hover:bg-card-2" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-4">
              <img src="/icons/icon-192.png" alt="" width={56} height={56} className="h-14 w-14 rounded-2xl shadow-sm" />
              <div>
                <h2 id="install-title" className="text-lg font-semibold text-ink">
                  Install {APP_NAME}
                </h2>
                <p className="text-sm text-ink-2">Use it like an app on your {platform === "desktop" ? "computer" : "phone"}.</p>
              </div>
            </div>

            <ul className="mt-5 space-y-2.5 text-sm text-ink-2">
              <li className="flex items-center gap-3">
                <Smartphone className="h-4 w-4 shrink-0 text-ink-3" /> Opens from your home screen, full screen
              </li>
              <li className="flex items-center gap-3">
                <Zap className="h-4 w-4 shrink-0 text-ink-3" /> Faster to open, no browser tabs to find
              </li>
              <li className="flex items-center gap-3">
                <MonitorSmartphone className="h-4 w-4 shrink-0 text-ink-3" /> Same account and data on every device
              </li>
            </ul>

            {deferred ? (
              <button type="button" onClick={install} disabled={busy} className={buttonClass("primary", "lg", "mt-6 w-full")}>
                <Download className="h-4 w-4" /> Install app
              </button>
            ) : platform === "ios" ? (
              <ol className="mt-6 space-y-3 rounded-2xl bg-card-2 p-4 text-sm text-ink">
                <li className="flex items-center gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-accent-ink">1</span>
                  <span>
                    Tap <Share className="mx-0.5 inline h-4 w-4 -translate-y-0.5" aria-label="Share" /> <b>Share</b> in the browser toolbar
                  </span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-accent-ink">2</span>
                  <span>
                    Choose <PlusSquare className="mx-0.5 inline h-4 w-4 -translate-y-0.5" aria-hidden /> <b>Add to Home Screen</b>
                  </span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-accent-ink">3</span>
                  <span>
                    Tap <b>Add</b>, then open {APP_NAME} from your home screen
                  </span>
                </li>
              </ol>
            ) : (
              <p className="mt-6 rounded-2xl bg-card-2 p-4 text-sm text-ink">
                Open your browser&apos;s menu and choose <b>Install {APP_NAME}</b> or <b>Add to Home screen</b>. If you don&apos;t see it,
                open this page in Chrome, Edge or Safari.
              </p>
            )}

            <button type="button" onClick={later} className={buttonClass("ghost", "md", "mt-2 w-full")}>
              Not now
            </button>
          </div>
        </div>
      )}
    </>
  );
}
