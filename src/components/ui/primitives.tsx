import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { initials as toInitials } from "@/lib/format";

// ───────── Card ─────────

export function Card({
  title,
  subtitle,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("min-w-0 rounded-card border border-line bg-card p-5", className)}>
      {(title || action) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-medium text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>}
          </div>
          {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

// ───────── Buttons ─────────

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors select-none",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
    "disabled:cursor-not-allowed disabled:opacity-50",
    {
      primary: "bg-accent text-white hover:bg-accent-hi",
      secondary: "bg-card-2 text-ink hover:bg-card-3 border border-line-2/60",
      outline: "border border-line-2 text-ink hover:bg-card-2",
      ghost: "text-ink-2 hover:bg-card-2 hover:text-ink",
      danger: "bg-bad/15 text-bad hover:bg-bad/25 border border-bad/30",
    }[variant],
    {
      sm: "h-8 px-3 text-xs",
      md: "h-10 px-4 text-sm",
      lg: "h-12 px-6 text-sm",
      icon: "h-10 w-10",
    }[size],
    className,
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

// ───────── Badge ─────────

export type Tone = "neutral" | "accent" | "good" | "warn" | "bad" | "info";

const toneClass: Record<Tone, string> = {
  neutral: "bg-card-3 text-ink-2",
  accent: "bg-accent-lo text-accent-hi",
  good: "bg-good-lo text-good",
  warn: "bg-warn-lo text-warn",
  bad: "bg-bad-lo text-bad",
  info: "bg-info-lo text-info",
};

export function Badge({ tone = "neutral", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium",
        toneClass[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

// ───────── Page header ─────────

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ───────── Empty state ─────────

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-2 px-6 py-12 text-center">
      {icon && <div className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-card-2 text-ink-2">{icon}</div>}
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-ink-3">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ───────── Table ─────────

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    // `relative` contains absolutely-positioned descendants (e.g. sr-only headers) inside the scroller.
    <div className={cn("relative -mx-5 overflow-x-auto px-5", className)}>
      <table className="w-full min-w-160 border-separate border-spacing-0 text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead>{children}</thead>;
}

export function TH({ children, className, align = "left" }: { children?: ReactNode; className?: string; align?: "left" | "right" | "center" }) {
  return (
    <th
      scope="col"
      className={cn(
        "border-b border-line px-3 pb-3 text-[11px] font-medium uppercase tracking-wide text-ink-3 first:pl-0 last:pr-0",
        { left: "text-left", right: "text-right", center: "text-center" }[align],
        className,
      )}
    >
      {children}
    </th>
  );
}

export function TD({ children, className, align = "left" }: { children?: ReactNode; className?: string; align?: "left" | "right" | "center" }) {
  return (
    <td
      className={cn(
        "border-b border-line/70 px-3 py-3 align-middle text-ink first:pl-0 last:pr-0",
        { left: "text-left", right: "text-right tabular", center: "text-center" }[align],
        className,
      )}
    >
      {children}
    </td>
  );
}

// ───────── Stat tile ─────────

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  href,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  href?: string;
  className?: string;
}) {
  const body = (
    <div
      className={cn(
        "flex h-full flex-col justify-between gap-3 rounded-card border border-line bg-card p-4 transition-colors",
        href && "hover:border-line-2 hover:bg-card-2/60",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-ink-2">{label}</span>
        {icon && <span className={cn("grid h-7 w-7 place-items-center rounded-full", toneClass[tone])}>{icon}</span>}
      </div>
      <div>
        <div className="tabular text-2xl font-semibold tracking-tight text-ink">{value}</div>
        {hint && <div className="mt-1 text-xs text-ink-3">{hint}</div>}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}

// ───────── Progress (segmented, like the reference dashboard) ─────────

export function SegmentedProgress({
  value,
  segments = 6,
  className,
  label,
}: {
  /** 0–100 */
  value: number;
  segments?: number;
  className?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  // First segment is long (the filled bar); remaining short segments show the remainder.
  return (
    <div className={cn("flex h-2 items-center gap-1", className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%`, minWidth: pct > 0 ? 6 : 0 }} />
      {pct < 100 && (
        <div className="flex h-full flex-1 gap-1">
          {Array.from({ length: segments }).map((_, i) => (
            <div key={i} className="h-full flex-1 rounded-full bg-card-3" />
          ))}
        </div>
      )}
    </div>
  );
}

export function ProgressBar({ value, tone = "accent", className }: { value: number; tone?: "accent" | "good" | "warn" | "bad"; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-card-3", className)}>
      <div
        className={cn("h-full rounded-full", { accent: "bg-accent", good: "bg-good", warn: "bg-warn", bad: "bg-bad" }[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ───────── Ring progress (financial-goals style) ─────────

export function Ring({
  value,
  size = 44,
  stroke = 4,
  color = "var(--color-series-1)",
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-card-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
        />
      </svg>
      <span className="absolute text-[10px] font-semibold text-ink tabular">{children ?? `${Math.round(pct)}%`}</span>
    </div>
  );
}

// ───────── Avatar ─────────

const avatarColors = ["#8b7cf6", "#2fa898", "#c07c2a", "#c85fbb", "#5b8def", "#d9654b"];

export function Avatar({ name, size = 36, className }: { name: string; size?: number; className?: string }) {
  const hash = [...name].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-full text-xs font-semibold text-white", className)}
      style={{ width: size, height: size, background: avatarColors[hash % avatarColors.length] }}
      aria-hidden
    >
      {toInitials(name)}
    </span>
  );
}

// ───────── Description list ─────────

export function DetailList({ items, className }: { items: { label: string; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-4 @xl:grid-cols-2", className)}>
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="text-xs text-ink-3">{it.label}</dt>
          <dd className="mt-0.5 wrap-break-word text-sm text-ink">{it.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

// ───────── Filter tabs (link based) ─────────

export function FilterTabs({ tabs, active }: { tabs: { label: string; href: string; value: string; count?: number }[]; active: string }) {
  return (
    <nav className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1">
      {tabs.map((t) => (
        <Link
          key={t.value}
          href={t.href}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
            t.value === active ? "bg-card-3 text-ink" : "text-ink-2 hover:bg-card-2 hover:text-ink",
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="tabular text-ink-3">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

/** A tinted callout for warnings/info inside pages. */
export function Callout({ tone = "info", title, children }: { tone?: Tone; title?: string; children?: ReactNode }) {
  return (
    <div className={cn("rounded-xl px-4 py-3 text-sm", toneClass[tone])}>
      {title && <p className="font-medium">{title}</p>}
      {children && <div className={cn(title && "mt-0.5", "text-[13px] opacity-90")}>{children}</div>}
    </div>
  );
}
