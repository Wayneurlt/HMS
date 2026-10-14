"use client";

import { RotateCw } from "lucide-react";
import { buttonClass } from "@/components/ui/primitives";

export function RetryButton() {
  return (
    <button type="button" onClick={() => window.location.reload()} className={buttonClass("primary", "lg", "mt-6 w-full")}>
      <RotateCw className="h-4 w-4" /> Try again
    </button>
  );
}
