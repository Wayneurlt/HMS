"use client";

import { useEffect, useRef } from "react";

/**
 * Makes the surrounding <Table> robust on any screen:
 *  - copies each column's header text onto its cells as `data-label`, so the stacked
 *    card layout can show "Amount  KES 6,000" style rows;
 *  - switches the table to that card layout (`data-stack`) whenever it would not fit its
 *    container, so wide tables never need sideways scrolling (tablets, narrow columns).
 * Phone widths are stacked by a CSS container query even before this script runs.
 */
export function TableLabels() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const wrapper = ref.current?.parentElement;
    const table = wrapper?.querySelector("table");
    if (!wrapper || !table) return;

    const label = () => {
      const headRow = table.tHead?.rows[table.tHead.rows.length - 1];
      if (!headRow) return;
      const labels: string[] = [];
      for (const th of Array.from(headRow.cells)) {
        const text = (th.textContent ?? "").trim();
        for (let i = 0; i < (th.colSpan || 1); i++) labels.push(text);
      }
      for (const section of [...Array.from(table.tBodies), ...(table.tFoot ? [table.tFoot] : [])]) {
        for (const row of Array.from(section.rows)) {
          let col = 0;
          for (const cell of Array.from(row.cells)) {
            const text = cell.colSpan > 1 ? "" : (labels[col] ?? "");
            if (cell.getAttribute("data-label") !== text) cell.setAttribute("data-label", text);
            col += cell.colSpan || 1;
          }
        }
      }
    };

    // Measure in table mode; stack only if the table is wider than the space it has.
    const fit = () => {
      const wasStacked = wrapper.hasAttribute("data-stack");
      if (wasStacked) wrapper.removeAttribute("data-stack");
      const overflows = wrapper.scrollWidth > wrapper.clientWidth + 1;
      if (overflows) wrapper.setAttribute("data-stack", "");
    };

    label();
    fit();
    const mutations = new MutationObserver(() => {
      label();
      fit();
    });
    mutations.observe(table, { childList: true, subtree: true, characterData: true });
    let lastWidth = wrapper.clientWidth;
    const resize = new ResizeObserver(() => {
      if (wrapper.clientWidth === lastWidth) return;
      lastWidth = wrapper.clientWidth;
      fit();
    });
    resize.observe(wrapper);
    return () => {
      mutations.disconnect();
      resize.disconnect();
    };
  }, []);

  return <span ref={ref} hidden aria-hidden />;
}
