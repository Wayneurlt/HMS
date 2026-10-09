"use client";

import { useRouter } from "next/navigation";

const OPTIONS = [
  { value: "ytd", label: "This Year" },
  { value: "6m", label: "Last 6 months" },
  { value: "12m", label: "Last 12 months" },
];

export function RangeSelect({ value }: { value: string }) {
  const router = useRouter();
  return (
    <select
      aria-label="Chart range"
      value={value}
      onChange={(e) => router.push(`/dashboard?range=${e.target.value}`, { scroll: false })}
      className="h-9 cursor-pointer appearance-none rounded-full border border-transparent bg-transparent bg-[length:14px] bg-[right_0.5rem_center] bg-no-repeat pl-3 pr-7 text-[13px] text-ink hover:border-line-2 focus:outline-none"
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%238a8a9a' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      }}
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
