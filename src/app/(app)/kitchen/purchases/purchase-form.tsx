"use client";

import { useState } from "react";
import { ActionForm, Checkbox, Field, FormActions, FormGrid, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { formatMoney, round2 } from "@/lib/format";
import { recordPurchaseAction } from "./actions";

export type PurchaseItemOption = { id: string; name: string; unit: string; supplier: string | null };
export type PurchaseRequestOption = {
  id: string;
  label: string;
  lines: { inventoryItemId: string; quantity: number; unitCost: number | null }[];
};

export function PurchaseForm({
  items,
  requests,
  todayISO,
  initialRequestId,
}: {
  items: PurchaseItemOption[];
  requests: PurchaseRequestOption[];
  todayISO: string;
  initialRequestId?: string;
}) {
  const initialRequest = requests.find((r) => r.id === initialRequestId);
  const firstLine = initialRequest?.lines[0];
  const firstItem = items.find((i) => i.id === firstLine?.inventoryItemId);

  const [requestId, setRequestId] = useState(initialRequest?.id ?? "");
  const [itemId, setItemId] = useState(firstItem?.id ?? "");
  const [quantity, setQuantity] = useState(firstLine ? String(firstLine.quantity) : "");
  const [unitCost, setUnitCost] = useState(firstLine?.unitCost ? String(firstLine.unitCost) : "");
  const [supplier, setSupplier] = useState(firstItem?.supplier ?? "");
  const [supplierTouched, setSupplierTouched] = useState(false);

  const item = items.find((i) => i.id === itemId);
  const request = requests.find((r) => r.id === requestId);
  const q = Number(quantity);
  const c = Number(unitCost);
  const total = quantity !== "" && unitCost !== "" && Number.isFinite(q) && Number.isFinite(c) ? round2(q * c) : null;

  const pickItem = (id: string, req = request) => {
    setItemId(id);
    const it = items.find((i) => i.id === id);
    if (!supplierTouched) setSupplier(it?.supplier ?? "");
    const line = req?.lines.find((l) => l.inventoryItemId === id);
    if (line) {
      setQuantity(String(line.quantity));
      setUnitCost(line.unitCost ? String(line.unitCost) : "");
    }
  };

  const pickRequest = (id: string) => {
    setRequestId(id);
    const req = requests.find((r) => r.id === id);
    if (req && !req.lines.some((l) => l.inventoryItemId === itemId)) {
      const first = req.lines.find((l) => items.some((i) => i.id === l.inventoryItemId));
      if (first) pickItem(first.inventoryItemId, req);
    }
  };

  const reset = () => {
    setRequestId("");
    setItemId("");
    setQuantity("");
    setUnitCost("");
    setSupplier("");
    setSupplierTouched(false);
  };

  return (
    <ActionForm action={recordPurchaseAction} onSuccess={reset}>
      {requests.length > 0 && (
        <Field label="For shopping request" name="shoppingRequestId" hint="Optional — link this purchase to an approved request">
          <Select
            name="shoppingRequestId"
            value={requestId}
            onChange={(e) => pickRequest(e.target.value)}
            placeholder="Not linked"
            options={requests.map((r) => ({ value: r.id, label: r.label }))}
          />
        </Field>
      )}
      <Field label="Item" name="itemId" required>
        <Select
          name="itemId"
          value={itemId}
          onChange={(e) => pickItem(e.target.value)}
          placeholder="Select an item"
          options={items.map((i) => ({
            value: i.id,
            label: request?.lines.some((l) => l.inventoryItemId === i.id) ? `${i.name} (${i.unit}) — on request` : `${i.name} (${i.unit})`,
          }))}
        />
      </Field>
      <FormGrid cols={3}>
        <Field label={`Quantity${item ? ` (${item.unit})` : ""}`} name="quantity" required>
          <Input name="quantity" type="number" step="any" min={0} inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </Field>
        <Field label="Unit cost (KES)" name="unitCost" required>
          <Input name="unitCost" type="number" step="0.01" min={0} inputMode="decimal" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
        </Field>
        <div className="space-y-1.5">
          <span className="block text-xs font-medium text-ink-2">Total</span>
          <div className="flex h-10 items-center rounded-xl border border-line bg-card-3/50 px-3.5 text-sm font-semibold tabular text-ink" aria-live="polite">
            {total === null ? "—" : formatMoney(total)}
          </div>
        </div>
      </FormGrid>
      <FormGrid>
        <Field label="Supplier" name="supplier">
          <Input
            name="supplier"
            value={supplier}
            onChange={(e) => {
              setSupplier(e.target.value);
              setSupplierTouched(true);
            }}
            maxLength={120}
          />
        </Field>
        <Field label="Purchase date" name="purchaseDate" required>
          <Input name="purchaseDate" type="date" defaultValue={todayISO} max={todayISO} />
        </Field>
      </FormGrid>
      <Field label="Receipt / reference" name="reference" hint="Optional, e.g. M-Pesa code or receipt number">
        <Input name="reference" maxLength={100} />
      </Field>
      <Field label="Notes" name="notes">
        <Textarea name="notes" rows={2} maxLength={1000} />
      </Field>
      {request && <Checkbox name="markRequestPurchased" label="Mark the shopping request as purchased" />}
      <FormActions>
        <SubmitButton>Record purchase</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
