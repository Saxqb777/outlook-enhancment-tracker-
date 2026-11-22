"use client";

import { Icon } from "@/components/Icon";

export default function PrintButton({ label = "Print or save as PDF" }: { label?: string }) {
  return (
    <button type="button" className="btn no-print" onClick={() => window.print()}>
      <Icon name="download" size={15} />
      {label}
    </button>
  );
}
