import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, BedDouble, Clock, Mail, MapPin, Phone, Soup, Wallet } from "lucide-react";
import type { SessionUser } from "@/lib/auth/session";
import { homePathFor } from "@/lib/auth/permissions";
import { formatMoney, label } from "@/lib/format";
import type { PublicInfo } from "@/lib/services/public-info";
import { buttonClass } from "@/components/ui/primitives";
import { ThemeToggle } from "@/components/theme-toggle";
import { LoginForm } from "./login/login-form";
import { MasqaniLogo } from "@/components/brand/masqani-logo";
import { APP_NAME } from "@/lib/brand";
import { logoutAction } from "./actions";

/**
 * Sign-in focused landing screen used by both "/" and "/login":
 * a hostel info panel on the left and the sign-in form on the right.
 */
export function SignInScreen({ info, user }: { info: PublicInfo | null; user: SessionUser | null }) {
  const name = APP_NAME;
  const hasRooms = !!info && info.totalBeds > 0;

  return (
    <div className="grid min-h-dvh bg-page lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      {/* ───── Hostel panel ───── */}
      <aside className="card-art relative order-2 flex flex-col overflow-hidden px-6 py-8 sm:px-10 lg:order-none lg:min-h-dvh lg:px-14 lg:py-12">
        <Wave className="pointer-events-none absolute -bottom-20 -right-48 h-64 w-184 opacity-35 max-lg:hidden" />

        <div className="relative hidden lg:flex">
          <MasqaniLogo className="h-28" />
        </div>

        <div className="relative mt-8 lg:mt-auto">
          {info && (
            <span className="inline-flex items-center gap-2 rounded-full border border-line-2 px-3 py-1 text-xs text-ink-2">
              <span className={hasRooms && info.availableBeds === 0 ? "h-2 w-2 rounded-full bg-warn" : "h-2 w-2 rounded-full bg-good"} />
              {!hasRooms
                ? "Now taking enquiries"
                : info.availableBeds > 0
                  ? `${info.availableBeds} bed${info.availableBeds === 1 ? "" : "s"} available`
                  : "Currently full: ask about the waiting list"}
            </span>
          )}
          <h1 className="mt-4 max-w-xl text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-4xl lg:text-5xl">
            Student accommodation, <span className="text-accent-hi">managed properly.</span>
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-ink-2 sm:text-base">
            A small hostel for male students: a bed of your own, breakfast and dinner every day, and simple monthly rent.
          </p>

          {info && (
            <dl className="mt-8 grid max-w-xl grid-cols-3 gap-2 sm:gap-3">
              <Fact icon={<Wallet className="h-4 w-4" />} label="Rent / month" value={formatMoney(info.rent)} />
              <Fact icon={<BedDouble className="h-4 w-4" />} label="Beds free" value={hasRooms ? String(info.availableBeds) : "Ask us"} />
              <Fact icon={<Soup className="h-4 w-4" />} label="Meals" value="2 a day" />
            </dl>
          )}
        </div>

        {info && (
          <div className="relative mt-8 flex flex-col gap-3 text-sm text-ink-2 lg:mt-auto lg:pt-10">
            <p className="flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0" /> Breakfast {info.breakfastTime} · Dinner {info.dinnerTime}
            </p>
            {info.address && (
              <p className="flex items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0" /> {info.address}
              </p>
            )}
            {(info.phone || info.email) && (
              <div className="flex flex-wrap gap-2 pt-1">
                {info.phone && (
                  <a href={`tel:${info.phone.replace(/\s+/g, "")}`} className={buttonClass("secondary", "sm", "h-9 px-4")}>
                    <Phone className="h-3.5 w-3.5" /> {info.phone}
                  </a>
                )}
                {info.email && (
                  <a href={`mailto:${info.email}`} className={buttonClass("secondary", "sm", "h-9 px-4")}>
                    <Mail className="h-3.5 w-3.5" /> {info.email}
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </aside>

      {/* ───── Sign-in panel ───── */}
      <main className="relative order-1 flex items-center justify-center px-5 pb-12 pt-20 sm:px-10 lg:order-none lg:py-12">
        <ThemeToggle className="absolute right-4 top-4 h-11 w-11 border border-line bg-card" />
        {/* Compact brand on phones, where the hostel panel comes after the form. */}
        <div className="absolute left-5 top-4 flex h-11 items-center sm:left-10 lg:hidden">
          <MasqaniLogo variant="inline" className="h-9" />
        </div>
        <div className="w-full max-w-sm">
          {info?.needsSetup ? (
            <>
              <h2 className="text-2xl font-semibold tracking-tight text-ink">Set up your hostel</h2>
              <p className="mt-2 text-sm text-ink-2">No owner account exists yet. Create it to start managing {name}.</p>
              <Link href="/setup" className={buttonClass("primary", "lg", "mt-8 w-full")}>
                Create owner account <ArrowRight className="h-4 w-4" />
              </Link>
            </>
          ) : user ? (
            <>
              <h2 className="text-2xl font-semibold tracking-tight text-ink">Welcome back, {user.name.split(" ")[0]}</h2>
              <p className="mt-2 text-sm text-ink-2">
                You&apos;re signed in as {label(user.role).toLowerCase()}.
              </p>
              <Link href={homePathFor(user.role)} className={buttonClass("primary", "lg", "mt-8 w-full")}>
                Open dashboard <ArrowRight className="h-4 w-4" />
              </Link>
              <form action={logoutAction} className="mt-3">
                <button type="submit" className={buttonClass("ghost", "md", "w-full")}>
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-semibold tracking-tight text-ink">Sign in</h2>
              <p className="mt-2 text-sm text-ink-2">For residents and staff of {name}.</p>
              <div className="mt-8">
                <LoginForm />
              </div>
              <p className="mt-8 border-t border-line pt-6 text-center text-sm text-ink-2">
                Looking for a room?{" "}
                {info?.phone ? (
                  <a href={`tel:${info.phone.replace(/\s+/g, "")}`} className="font-medium text-accent-hi hover:underline">
                    Call us to book a viewing
                  </a>
                ) : info?.email ? (
                  <a href={`mailto:${info.email}`} className="font-medium text-accent-hi hover:underline">
                    Email us to book a viewing
                  </a>
                ) : (
                  <span>Visit the hostel office to book a viewing.</span>
                )}
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function Fact({ icon, label: text, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line-2/70 bg-card/60 px-3 py-3 backdrop-blur sm:px-4">
      <dt className="flex items-center gap-1.5 text-[11px] text-ink-3">
        {icon}
        {text}
      </dt>
      <dd className="tabular mt-1.5 truncate text-sm font-semibold text-ink sm:text-lg">{value}</dd>
    </div>
  );
}

function Wave({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 300 170" className={className} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="signin-wave" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#9ad9ea" />
          <stop offset="1" stopColor="#e6f6fb" />
        </linearGradient>
      </defs>
      <path
        d="M -10 150 C 40 150, 50 70, 90 70 S 120 140, 150 120 S 170 40, 200 45 S 230 110, 255 95 S 275 30, 310 40"
        fill="none"
        stroke="url(#signin-wave)"
        strokeWidth="12"
        strokeLinecap="round"
      />
    </svg>
  );
}
