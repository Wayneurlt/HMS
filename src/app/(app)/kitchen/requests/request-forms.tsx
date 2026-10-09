"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { ActionForm, Field, FormActions, FormGrid, Input, Select, SubmitButton, Textarea, useFormErrors } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/primitives";
import { formatMoney, formatNumber, round2 } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PRIORITIES, toOptions } from "../constants";
import { createShoppingRequest, markRequestPurchased, reviewShoppingRequest } from "./actions";

export type RequestStockOption = { id: string; name: string; unit: string; suggested: number };

type Line = { key: number; inventoryItemId: string; name: string; unit: string; quantity: string; estimatedCost: string };

const OTHER = "__other";
const inputClass =
  "h-10 w-full rounded-xl border border-line-2 bg-card-2 px-3 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 aria-[invalid=true]:border-bad/70";

let nextKey = 1;
const blankLine = (): Line => ({ key: nextKey++, inventoryItemId: "", name: "", unit: "", quantity: "", estimatedCost: "" });

function lineFor(item: RequestStockOption | undefined): Line {
  if (!item) return blankLine();
  return { ...blankLine(), inventoryItemId: item.id, quantity: item.suggested > 0 ? String(item.suggested) : "" };
}

function LineEditor({ lines, setLines, stock }: { lines: Line[]; setLines: (l: Line[]) => void; stock: RequestStockOption[] }) {
  const { errors } = useFormErrors();
  const update = (key: number, patch: Partial<Line>) => setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const err = (i: number, f: string) => errors[`items.${i}.${f}`]?.[0];
  const listError = errors["items"]?.[0];
  const estTotal = round2(lines.reduce((a, l) => a + (Number(l.estimatedCost) || 0), 0));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ink-2">
          Items <span className="text-bad">*</span>
        </span>
        {estTotal > 0 && <span className="text-xs text-ink-3">Estimated total {formatMoney(estTotal)}</span>}
      </div>
      {lines.map((l, i) => {
        const item = stock.find((s) => s.id === l.inventoryItemId);
        const isOther = l.inventoryItemId === OTHER;
        const lineErrors = [err(i, "inventoryItemId"), err(i, "name"), err(i, "unit"), err(i, "quantity"), err(i, "estimatedCost")].filter(Boolean);
        return (
          <div key={l.key} className="rounded-xl border border-line bg-card-2/40 p-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
              <div className="col-span-2 space-y-2 sm:col-span-1">
                <select
                  aria-label={`Item ${i + 1}`}
                  value={l.inventoryItemId}
                  onChange={(e) => {
                    const v = e.target.value;
                    const s = stock.find((x) => x.id === v);
                    update(l.key, {
                      inventoryItemId: v,
                      quantity: l.quantity || (s && s.suggested > 0 ? String(s.suggested) : ""),
                    });
                  }}
                  aria-invalid={err(i, "name") || err(i, "inventoryItemId") ? true : undefined}
                  className={inputClass}
                >
                  <option value="">Select an item…</option>
                  {stock.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.unit})
                    </option>
                  ))}
                  <option value={OTHER}>Other (not in stock list)…</option>
                </select>
                {isOther && (
                  <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-2">
                    <input
                      aria-label="Item name"
                      placeholder="Item name"
                      maxLength={80}
                      value={l.name}
                      onChange={(e) => update(l.key, { name: e.target.value })}
                      aria-invalid={err(i, "name") ? true : undefined}
                      className={inputClass}
                    />
                    <input
                      aria-label="Unit"
                      placeholder="Unit"
                      maxLength={20}
                      value={l.unit}
                      onChange={(e) => update(l.key, { unit: e.target.value })}
                      aria-invalid={err(i, "unit") ? true : undefined}
                      className={inputClass}
                    />
                  </div>
                )}
              </div>
              <div className="relative">
                <input
                  aria-label="Quantity"
                  type="number"
                  step="any"
                  min={0}
                  inputMode="decimal"
                  placeholder="Qty"
                  value={l.quantity}
                  onChange={(e) => update(l.key, { quantity: e.target.value })}
                  aria-invalid={err(i, "quantity") ? true : undefined}
                  className={cn(inputClass, item && "pr-12")}
                />
                {item && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-ink-3">{item.unit}</span>}
              </div>
              <input
                aria-label="Estimated cost (KES)"
                type="number"
                step="0.01"
                min={0}
                inputMode="decimal"
                placeholder="Est. cost"
                value={l.estimatedCost}
                onChange={(e) => update(l.key, { estimatedCost: e.target.value })}
                aria-invalid={err(i, "estimatedCost") ? true : undefined}
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => setLines(lines.filter((x) => x.key !== l.key))}
                disabled={lines.length === 1}
                className={buttonClass("ghost", "icon", "col-span-2 h-10 w-full sm:col-span-1 sm:w-10")}
                aria-label="Remove item"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {lineErrors.length > 0 && (
              <p className="mt-2 text-xs text-bad" role="alert">
                {lineErrors[0]}
              </p>
            )}
          </div>
        );
      })}
      {listError && (
        <p className="text-xs text-bad" role="alert">
          {listError}
        </p>
      )}
      <button type="button" onClick={() => setLines([...lines, blankLine()])} disabled={lines.length >= 30} className={buttonClass("outline", "sm")}>
        <Plus className="h-4 w-4" /> Add item
      </button>
      <p className="text-xs text-ink-3">Estimated cost is the expected total for the line, not per unit.</p>
    </div>
  );
}

export function ShoppingRequestForm({ stock, initialItemId, todayISO }: { stock: RequestStockOption[]; initialItemId?: string; todayISO: string }) {
  const [lines, setLines] = useState<Line[]>(() => [lineFor(stock.find((s) => s.id === initialItemId))]);
  const payload = lines.map((l) =>
    l.inventoryItemId === OTHER || !l.inventoryItemId
      ? { inventoryItemId: "", name: l.name, unit: l.unit, quantity: l.quantity, estimatedCost: l.estimatedCost }
      : { inventoryItemId: l.inventoryItemId, quantity: l.quantity, estimatedCost: l.estimatedCost },
  );
  return (
    <ActionForm action={createShoppingRequest} onSuccess={() => setLines([blankLine()])}>
      <input type="hidden" name="items:json" value={JSON.stringify(payload)} />
      <LineEditor lines={lines} setLines={setLines} stock={stock} />
      <FormGrid>
        <Field label="Priority" name="priority">
          <Select name="priority" defaultValue="NORMAL" options={toOptions(PRIORITIES)} />
        </Field>
        <Field label="Needed by" name="neededBy" hint="Optional">
          <Input name="neededBy" type="date" min={todayISO} />
        </Field>
      </FormGrid>
      <Field label="Reason" name="reason" hint="Optional, e.g. Running low before the weekend">
        <Textarea name="reason" rows={2} maxLength={500} />
      </Field>
      <FormActions>
        <SubmitButton>Send request</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

export function ReviewRequestForm({ id, decision }: { id: string; decision: "APPROVE" | "REJECT" }) {
  return (
    <ActionForm action={reviewShoppingRequest}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="decision" value={decision} />
      <Field label="Note to the requester" name="note" hint="Optional">
        <Textarea name="note" rows={3} maxLength={500} placeholder={decision === "APPROVE" ? "e.g. Buy from the wholesaler" : "e.g. Not this month"} />
      </Field>
      <FormActions>
        <SubmitButton variant={decision === "APPROVE" ? "primary" : "danger"}>{decision === "APPROVE" ? "Approve request" : "Reject request"}</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

/** Shows the first server error whose key starts with `prefix` (for JSON-encoded line items). */
function PrefixErrors({ prefix }: { prefix: string }) {
  const { errors } = useFormErrors();
  const key = Object.keys(errors).find((k) => k.startsWith(prefix) || k === prefix.slice(0, -1));
  if (!key) return null;
  const idx = Number(key.split(".")[1]);
  return (
    <p className="text-xs text-bad" role="alert">
      {Number.isInteger(idx) ? `Line ${idx + 1}: ` : ""}
      {errors[key]![0]}
    </p>
  );
}

export type PurchasableLine = { inventoryItemId: string; name: string; unit: string; quantity: number; unitCost: number | null };

export function MarkPurchasedForm({
  id,
  lines,
  otherItems,
  canRecord,
  todayISO,
}: {
  id: string;
  lines: PurchasableLine[];
  otherItems: string[];
  canRecord: boolean;
  todayISO: string;
}) {
  const [rows, setRows] = useState(() =>
    lines.map((l) => ({ ...l, include: canRecord, qty: String(l.quantity), cost: l.unitCost ? String(l.unitCost) : "" })),
  );
  const included = rows.filter((r) => r.include);
  const payload = included.map((r) => ({ inventoryItemId: r.inventoryItemId, quantity: r.qty, unitCost: r.cost }));
  const total = round2(included.reduce((a, r) => a + (Number(r.qty) || 0) * (Number(r.cost) || 0), 0));

  return (
    <ActionForm action={markRequestPurchased}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="lines:json" value={JSON.stringify(payload)} />
      {canRecord && rows.length > 0 ? (
        <>
          <p className="text-sm text-ink-2">Tick the items you bought to add them to stock as purchases. Untick anything you did not buy.</p>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={r.inventoryItemId + i} className={cn("rounded-xl border border-line p-3", !r.include && "opacity-60")}>
                <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-ink">
                  <input
                    type="checkbox"
                    checked={r.include}
                    onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))}
                    className="h-4 w-4 accent-(--color-accent)"
                  />
                  {r.name}
                  <span className="text-xs font-normal text-ink-3">
                    requested {formatNumber(r.quantity, 3)} {r.unit}
                  </span>
                </label>
                {r.include && (
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <input
                      aria-label={`Quantity bought (${r.unit})`}
                      type="number"
                      step="any"
                      min={0}
                      inputMode="decimal"
                      value={r.qty}
                      onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))}
                      className={inputClass}
                    />
                    <input
                      aria-label="Unit cost (KES)"
                      type="number"
                      step="0.01"
                      min={0}
                      inputMode="decimal"
                      placeholder="Unit cost"
                      value={r.cost}
                      onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, cost: e.target.value } : x)))}
                      className={inputClass}
                    />
                    <div className="flex h-10 items-center justify-end text-sm font-medium tabular text-ink">
                      {formatMoney(round2((Number(r.qty) || 0) * (Number(r.cost) || 0)))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          {included.length > 0 && (
            <>
              <div className="flex justify-between rounded-xl bg-card-2 px-4 py-2.5 text-sm">
                <span className="text-ink-2">Total</span>
                <span className="font-semibold tabular text-ink">{formatMoney(total)}</span>
              </div>
              <FormGrid cols={3}>
                <Field label="Purchase date" name="purchaseDate" required>
                  <Input name="purchaseDate" type="date" defaultValue={todayISO} max={todayISO} />
                </Field>
                <Field label="Supplier" name="supplier" hint="Blank = item's usual supplier">
                  <Input name="supplier" maxLength={120} />
                </Field>
                <Field label="Receipt / reference" name="reference">
                  <Input name="reference" maxLength={100} />
                </Field>
              </FormGrid>
            </>
          )}
        </>
      ) : (
        <p className="text-sm text-ink-2">
          {canRecord
            ? "None of the items on this request are tracked in stock, so no purchases will be added."
            : "This marks the request as bought. Kitchen staff or the owner record the actual purchases and costs."}
        </p>
      )}
      {otherItems.length > 0 && canRecord && (
        <p className="text-xs text-ink-3">Not tracked in stock: {otherItems.join(", ")}. Record their cost as a kitchen expense if needed.</p>
      )}
      <PrefixErrors prefix="lines." />
      <FormActions>
        <SubmitButton>Mark as purchased</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
