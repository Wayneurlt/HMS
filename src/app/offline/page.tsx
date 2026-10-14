import { WifiOff } from "lucide-react";
import { MasqaniLogo } from "@/components/brand/masqani-logo";
import { RetryButton } from "./retry-button";

export const metadata = { title: "Offline" };

/** Shown by the service worker when a page can't load without a connection. */
export default function OfflinePage() {
  return (
    <div className="grid min-h-dvh place-items-center bg-page px-6 text-center">
      <div className="max-w-sm">
        <MasqaniLogo className="mx-auto h-20" />
        <span className="mx-auto mt-8 grid h-14 w-14 place-items-center rounded-full bg-card-2 text-ink-2">
          <WifiOff className="h-6 w-6" />
        </span>
        <h1 className="mt-5 text-xl font-semibold text-ink">You&apos;re offline</h1>
        <p className="mt-2 text-sm text-ink-2">
          Masqani needs an internet connection to show up-to-date rent, meals and kitchen information. Check your connection and
          try again.
        </p>
        <RetryButton />
      </div>
    </div>
  );
}
