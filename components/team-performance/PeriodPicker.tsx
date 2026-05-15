"use client";

/**
 * Period selector for the Team Performance page. Pushes ?period= (and
 * optionally ?start=/?end=) onto the router; the page is RSC so query
 * change triggers a server re-render.
 *
 * Brief 3 § B.2: This Month / Last Month / Quarter / YTD / Last 12 / Custom.
 */

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import type { PeriodKey } from "@/lib/dateUtils";

const PRESETS: { value: PeriodKey; label: string }[] = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "qtd", label: "Quarter to date" },
  { value: "ytd", label: "Year to date" },
  { value: "last_12", label: "Last 12 months" },
  { value: "custom", label: "Custom" },
];

interface Props {
  period: PeriodKey;
  customStart: string | null;
  customEnd: string | null;
}

export function PeriodPicker({ period, customStart, customEnd }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [draftStart, setDraftStart] = useState(customStart ?? "");
  const [draftEnd, setDraftEnd] = useState(customEnd ?? "");

  function applyPreset(next: PeriodKey) {
    const sp = new URLSearchParams(params.toString());
    sp.set("period", next);
    if (next !== "custom") {
      sp.delete("start");
      sp.delete("end");
    }
    router.push(`${pathname}?${sp.toString()}`);
  }

  function applyCustom() {
    if (!draftStart || !draftEnd) return;
    const sp = new URLSearchParams(params.toString());
    sp.set("period", "custom");
    sp.set("start", draftStart);
    sp.set("end", draftEnd);
    router.push(`${pathname}?${sp.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-lg border border-club19-warmgrey bg-white p-1">
        {PRESETS.map((p) => {
          const active = period === p.value;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => applyPreset(p.value)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                active
                  ? "bg-club19-navy text-club19-cream"
                  : "text-club19-navy hover:bg-club19-cream"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {period === "custom" && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={draftStart}
            onChange={(e) => setDraftStart(e.target.value)}
            className="rounded-md border border-club19-warmgrey bg-white px-2 py-1.5 text-sm text-club19-navy"
          />
          <span className="text-sm text-club19-taupe">to</span>
          <input
            type="date"
            value={draftEnd}
            onChange={(e) => setDraftEnd(e.target.value)}
            className="rounded-md border border-club19-warmgrey bg-white px-2 py-1.5 text-sm text-club19-navy"
          />
          <button
            type="button"
            onClick={applyCustom}
            disabled={!draftStart || !draftEnd}
            className="rounded-md bg-club19-navy px-3 py-1.5 text-sm text-club19-cream hover:bg-club19-navy-light disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
