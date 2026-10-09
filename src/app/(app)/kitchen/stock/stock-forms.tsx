"use client";

import { useState } from "react";
import { ActionForm, Field, FormActions, FormGrid, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { formatNumber } from "@/lib/format";
import { INVENTORY_CATEGORIES, toOptions } from "../constants";
import { adjustStock, createStockItem, updateStockItem } from "./actions";

export type StockItemValues = {
  id: string;
  name: string;
  category: string;
  unit: string;
  minQuantity: number;
  maxQuantity: number | null;
  supplier: string | null;
  notes: string | null;
};

export function StockItemForm({ initial }: { initial?: StockItemValues }) {
  return (
    <ActionForm action={initial ? updateStockItem : createStockItem} resetOnSuccess={!initial}>
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <FormGrid>
        <Field label="Item name" name="name" required>
          <Input name="name" defaultValue={initial?.name} placeholder="e.g. Rice" maxLength={80} />
        </Field>
        <Field label="Category" name="category" required>
          <Select name="category" defaultValue={initial?.category ?? "OTHER"} options={toOptions(INVENTORY_CATEGORIES)} />
        </Field>
      </FormGrid>
      <FormGrid cols={3}>
        <Field label="Unit" name="unit" required hint="kg, L, pcs…">
          <Input name="unit" defaultValue={initial?.unit} placeholder="kg" maxLength={20} />
        </Field>
        <Field label="Minimum" name="minQuantity" required hint="Low-stock level">
          <Input name="minQuantity" type="number" step="any" min={0} inputMode="decimal" defaultValue={initial?.minQuantity ?? 0} />
        </Field>
        <Field label="Maximum" name="maxQuantity" hint="Optional">
          <Input name="maxQuantity" type="number" step="any" min={0} inputMode="decimal" defaultValue={initial?.maxQuantity ?? ""} />
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label="Usual supplier" name="supplier" hint="Optional">
          <Input name="supplier" defaultValue={initial?.supplier ?? ""} maxLength={120} />
        </Field>
        {!initial && (
          <Field label="Opening quantity" name="openingQuantity" hint="Quantity currently in the store">
            <Input name="openingQuantity" type="number" step="any" min={0} inputMode="decimal" placeholder="0" />
          </Field>
        )}
      </FormGrid>
      <Field label="Notes" name="notes">
        <Textarea name="notes" rows={2} defaultValue={initial?.notes ?? ""} maxLength={1000} />
      </Field>
      <FormActions>
        <SubmitButton>{initial ? "Save changes" : "Add item"}</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

const MODES = [
  { value: "CONSUMPTION", label: "Used (consumption)" },
  { value: "WASTE", label: "Wasted / spoiled" },
  { value: "COUNT", label: "Set counted quantity" },
];

export function AdjustStockForm({ item }: { item: { id: string; name: string; unit: string; quantity: number } }) {
  const [mode, setMode] = useState("CONSUMPTION");
  const [qty, setQty] = useState("");
  const n = Number(qty);
  const valid = qty !== "" && Number.isFinite(n);
  const after = !valid ? null : mode === "COUNT" ? n : item.quantity - n;
  const diff = after === null ? null : Math.round((after - item.quantity) * 1000) / 1000;

  return (
    <ActionForm
      action={adjustStock}
      onSuccess={() => {
        setQty("");
        setMode("CONSUMPTION");
      }}
    >
      <input type="hidden" name="id" value={item.id} />
      <div className="rounded-xl bg-card-2 px-4 py-3 text-sm">
        <span className="text-ink-2">Current balance: </span>
        <span className="tabular font-semibold text-ink">
          {formatNumber(item.quantity, 3)} {item.unit}
        </span>
      </div>
      <FormGrid>
        <Field label="Type" name="mode" required>
          <Select name="mode" value={mode} onChange={(e) => setMode(e.target.value)} options={MODES} />
        </Field>
        <Field label={mode === "COUNT" ? `Counted quantity (${item.unit})` : `Quantity (${item.unit})`} name="quantity" required>
          <Input
            name="quantity"
            type="number"
            step="any"
            min={0}
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </Field>
      </FormGrid>
      {after !== null && diff !== null && (
        <p className={after < 0 ? "text-xs text-bad" : "text-xs text-ink-2"}>
          {after < 0 ? (
            <>Not enough stock — only {formatNumber(item.quantity, 3)} {item.unit} available.</>
          ) : (
            <>
              Change{" "}
              <span className={diff > 0 ? "text-good" : diff < 0 ? "text-bad" : ""}>
                {diff > 0 ? "+" : ""}
                {formatNumber(diff, 3)}
              </span>{" "}
              → new balance <span className="tabular font-medium text-ink">{formatNumber(after, 3)} {item.unit}</span>
            </>
          )}
        </p>
      )}
      <Field label="Reason" name="reason" required={mode !== "CONSUMPTION"} hint={mode === "CONSUMPTION" ? "Optional, e.g. Dinner" : undefined}>
        <Input name="reason" maxLength={300} placeholder={mode === "WASTE" ? "e.g. Spoiled milk" : mode === "COUNT" ? "e.g. Weekly stock take" : ""} />
      </Field>
      <FormActions>
        <SubmitButton>Save adjustment</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
