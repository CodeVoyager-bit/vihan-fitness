"use client";

import { Printer } from "lucide-react";
import { btn } from "@/components/ui";

export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={`no-print mt-8 ${btn({ variant: "dark" })}`}>
      <Printer className="size-5" aria-hidden />
      {label}
    </button>
  );
}
