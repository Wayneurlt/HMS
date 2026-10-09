"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCompact, formatMoney, formatNumber } from "@/lib/format";

/** Validated categorical order (see globals.css). Assign by entity, never cycle. */
export const SERIES = ["#8b7cf6", "#2fa898", "#c07c2a", "#c85fbb"] as const;

export type SeriesDef = { key: string; label: string; color?: string };
type ValueKind = "money" | "number";

const fmt = (v: number, kind: ValueKind) => (kind === "money" ? formatMoney(v) : formatNumber(v));

function ChartTooltip({
  active,
  payload,
  label,
  kind,
  series,
}: {
  active?: boolean;
  payload?: { dataKey?: string | number; value?: number; color?: string }[];
  label?: string;
  kind: ValueKind;
  series: SeriesDef[];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line-2 bg-card-2/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      {label && <div className="mb-1 font-medium text-ink">{label}</div>}
      {payload.map((p) => {
        const s = series.find((x) => x.key === p.dataKey);
        return (
          <div key={String(p.dataKey)} className="flex items-center justify-between gap-4 text-ink-2">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
              {s?.label ?? p.dataKey}
            </span>
            <span className="tabular font-medium text-ink">{fmt(Number(p.value ?? 0), kind)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Legend({ series }: { series: SeriesDef[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
      {series.map((s, i) => (
        <span key={s.key} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: s.color ?? SERIES[i] }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

const axisProps = {
  stroke: "var(--color-ink-3)",
  tick: { fill: "var(--color-ink-3)", fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

/** Smooth gradient area chart (reference dashboard "Transactions Overview"). */
export function TrendAreaChart({
  data,
  xKey,
  series,
  kind = "money",
  height = 240,
}: {
  data: Record<string, string | number>[];
  xKey: string;
  series: SeriesDef[];
  kind?: ValueKind;
  height?: number;
}) {
  const withColors = series.map((s, i) => ({ ...s, color: s.color ?? SERIES[i]! }));
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
          <defs>
            {withColors.map((s) => (
              <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.45} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke="var(--color-line)" strokeDasharray="0" />
          <XAxis dataKey={xKey} {...axisProps} dy={6} />
          <YAxis {...axisProps} width={48} tickFormatter={(v: number) => formatCompact(v)} />
          <Tooltip
            cursor={{ stroke: "var(--color-ink-3)", strokeDasharray: "4 4" }}
            content={<ChartTooltip kind={kind} series={withColors} />}
          />
          {withColors.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={2}
              fill={`url(#grad-${s.key})`}
              activeDot={{ r: 5, stroke: "var(--color-card)", strokeWidth: 2, fill: s.color }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Vertical bars, grouped or stacked. */
export function SimpleBarChart({
  data,
  xKey,
  series,
  kind = "money",
  height = 240,
  stacked,
}: {
  data: Record<string, string | number>[];
  xKey: string;
  series: SeriesDef[];
  kind?: ValueKind;
  height?: number;
  stacked?: boolean;
}) {
  const withColors = series.map((s, i) => ({ ...s, color: s.color ?? SERIES[i]! }));
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }} barGap={2}>
          <CartesianGrid vertical={false} stroke="var(--color-line)" />
          <XAxis dataKey={xKey} {...axisProps} dy={6} />
          <YAxis {...axisProps} width={48} tickFormatter={(v: number) => formatCompact(v)} allowDecimals={kind === "money"} />
          <Tooltip cursor={{ fill: "var(--color-card-2)" }} content={<ChartTooltip kind={kind} series={withColors} />} />
          {withColors.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              fill={s.color}
              stackId={stacked ? "a" : undefined}
              radius={stacked ? (i === withColors.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]) : [4, 4, 0, 0]}
              maxBarSize={28}
              stroke="var(--color-card)"
              strokeWidth={stacked ? 1 : 0}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Rounded, gapped donut with a centre total (reference "All Expenses"). */
export function DonutChart({
  data,
  kind = "money",
  centerLabel = "Total",
  height = 220,
}: {
  data: { name: string; value: number; color?: string }[];
  kind?: ValueKind;
  centerLabel?: string;
  height?: number;
}) {
  const total = data.reduce((a, d) => a + d.value, 0);
  const rows = data.map((d, i) => ({ ...d, color: d.color ?? SERIES[i % SERIES.length]! }));
  const visible = rows.filter((d) => d.value > 0);
  return (
    <div className="relative w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="rounded-xl border border-line-2 bg-card-2/95 px-3 py-2 text-xs shadow-xl">
                  <span className="text-ink-2">{payload[0]!.name}: </span>
                  <span className="tabular font-medium text-ink">{fmt(Number(payload[0]!.value), kind)}</span>
                </div>
              ) : null
            }
          />
          <Pie
            data={visible.length ? visible : [{ name: "None", value: 1, color: "var(--color-card-3)" }]}
            dataKey="value"
            nameKey="name"
            innerRadius="62%"
            outerRadius="95%"
            paddingAngle={visible.length > 1 ? 3 : 0}
            cornerRadius={8}
            stroke="none"
            startAngle={90}
            endAngle={-270}
            isAnimationActive={false}
          >
            {(visible.length ? visible : [{ color: "var(--color-card-3)" }]).map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div className="text-xs text-ink-2">{centerLabel}</div>
          <div className="tabular text-lg font-semibold text-ink">{kind === "money" ? formatMoney(total) : formatNumber(total)}</div>
        </div>
      </div>
    </div>
  );
}
