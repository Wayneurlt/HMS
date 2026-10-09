import { NextResponse, type NextRequest } from "next/server";
import { authorize, AuthError } from "@/lib/auth/guards";
import type { Permission } from "@/lib/auth/permissions";
import { toISODate } from "@/lib/dates";
import { toCsv } from "@/lib/utils";

import {
  expensesCsvRows,
  kitchenCsvRows,
  occupancyCsvRows,
  parseCategory,
  parseRange,
  paymentsCsvRows,
  purchasesCsvRows,
  rentCsvRows,
  studentsCsvRows,
  type ReportRange,
} from "@/app/(app)/reports/data";

export const dynamic = "force-dynamic";

type Builder = (range: ReportRange, req: NextRequest) => Promise<{ headers: string[]; rows: unknown[][] }>;

const REPORTS: Record<string, { permission: Permission; build: Builder }> = {
  occupancy: { permission: "reports.operational", build: () => occupancyCsvRows() },
  rent: { permission: "reports.operational", build: (r) => rentCsvRows(r) },
  students: { permission: "reports.operational", build: (r) => studentsCsvRows(r) },
  payments: { permission: "reports.operational", build: (r) => paymentsCsvRows(r) },
  kitchen: { permission: "reports.kitchen", build: (r, req) => kitchenCsvRows(r, parseCategory(req.nextUrl.searchParams.get("category"))) },
  expenses: { permission: "reports.kitchen", build: (r, req) => expensesCsvRows(r, parseCategory(req.nextUrl.searchParams.get("category"))) },
  purchases: { permission: "reports.kitchen", build: (r) => purchasesCsvRows(r) },
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const report = Object.hasOwn(REPORTS, type) ? REPORTS[type] : undefined;
  if (!report) return NextResponse.json({ error: "Unknown report" }, { status: 404 });

  try {
    await authorize(report.permission);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const range = parseRange({ from: req.nextUrl.searchParams.get("from"), to: req.nextUrl.searchParams.get("to") });
  const { headers, rows } = await report.build(range, req);
  // BOM so Excel opens UTF-8 correctly.
  const body = "﻿" + toCsv(headers, rows);
  const filename = `${type}-${toISODate(range.from)}-to-${toISODate(range.to)}.csv`;
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
