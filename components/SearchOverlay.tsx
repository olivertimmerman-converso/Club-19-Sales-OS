/**
 * Club 19 Sales OS - Global Search Overlay
 *
 * Mobile: full-screen overlay sliding down from top
 * Desktop: centered modal with backdrop
 * Cmd+K / Ctrl+K keyboard shortcut to open
 * Debounced search with sale card results
 */

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Loader2 } from "lucide-react";
import { getInvoiceStatusDisplay } from "@/lib/invoice-status";

interface SearchResult {
  id: string;
  sale_reference: string | null;
  sale_date: string | null;
  brand: string | null;
  item_title: string | null;
  sale_amount_inc_vat: number | null;
  xero_invoice_number: string | null;
  invoice_status: string | null;
  currency: string | null;
  is_payment_plan: boolean;
  buyer: { name: string } | null;
  shopper: { id: string; name: string } | null;
}

interface SearchOverlayProps {
  open: boolean;
  onClose: () => void;
}

export function SearchOverlay({ open, onClose }: SearchOverlayProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Focus input when overlay opens
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSearched(false);
      // Small delay to let the overlay render
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Lock body scroll
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `/api/sales/search?q=${encodeURIComponent(q)}`
      );
      if (res.ok) {
        const data = await res.json();
        setResults(data.results || []);
      } else {
        setResults([]);
      }
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }, []);

  const handleInput = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.length < 2) {
      setResults([]);
      setSearched(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  };

  const handleSelect = (id: string) => {
    onClose();
    router.push(`/sales/${id}`);
  };

  const formatCurrency = (
    amount: number | null | undefined,
    currency: string | null | undefined
  ) => {
    if (!amount) return "—";
    const curr = currency || "GBP";
    const symbol = curr === "GBP" ? "£" : curr === "EUR" ? "€" : "$";
    return `${symbol}${amount.toLocaleString("en-GB", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  // Status pill — colours and labels live in lib/invoice-status.ts.
  const getStatusBadge = (status: string | null | undefined) => {
    if (!status) return null;
    const { label, colorClass } = getInvoiceStatusDisplay(status);
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${colorClass}`}
      >
        {label}
      </span>
    );
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel — full screen on mobile, modal on desktop */}
      <div className="absolute inset-0 md:inset-auto md:top-[10%] md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-lg md:max-h-[70vh] bg-white md:rounded-xl md:shadow-2xl flex flex-col overflow-hidden">
        {/* Search Header */}
        <div className="flex items-center gap-3 px-4 h-14 border-b border-gray-200 shrink-0">
          <Search size={18} className="text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            placeholder="Search sales by invoice, client, brand..."
            className="flex-1 text-base bg-transparent outline-none placeholder:text-gray-400"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {loading && (
            <Loader2
              size={18}
              className="text-gray-400 animate-spin shrink-0"
            />
          )}
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors shrink-0"
            aria-label="Close search"
          >
            <X size={18} />
          </button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {/* Hint state */}
          {!searched && !loading && query.length < 2 && (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <Search size={32} className="text-gray-300 mb-3" />
              <p className="text-sm text-gray-500">
                Search by invoice number, client name, or brand
              </p>
              <p className="text-xs text-gray-400 mt-1 hidden md:block">
                Press <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] font-mono">Esc</kbd> to close
              </p>
            </div>
          )}

          {/* No results */}
          {searched && !loading && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <p className="text-sm text-gray-500">
                No sales found for &ldquo;{query}&rdquo;
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Try a different search term
              </p>
            </div>
          )}

          {/* Result cards */}
          {results.length > 0 && (
            <div className="p-2 space-y-1">
              {results.map((sale) => (
                <button
                  key={sale.id}
                  onClick={() => handleSelect(sale.id)}
                  className="w-full text-left p-3 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  {/* Row 1: Ref + Amount */}
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-semibold text-sm text-purple-600">
                      {sale.sale_reference ||
                        sale.xero_invoice_number ||
                        "—"}
                    </span>
                    <span className="font-semibold text-sm text-gray-900">
                      {formatCurrency(
                        sale.sale_amount_inc_vat,
                        sale.currency
                      )}
                    </span>
                  </div>
                  {/* Row 2: Buyer */}
                  <div className="text-sm text-gray-700">
                    {sale.buyer?.name || "—"}
                  </div>
                  {/* Row 3: Brand + Shopper */}
                  {(sale.brand || sale.shopper?.name) && (
                    <div className="text-xs text-gray-500 mt-0.5">
                      {[sale.brand, sale.shopper?.name]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  )}
                  {/* Row 4: Date + Status */}
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-gray-400">
                      {formatDate(sale.sale_date)}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {sale.is_payment_plan && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-800">
                          Plan
                        </span>
                      )}
                      {getStatusBadge(sale.invoice_status)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer hint — desktop only */}
        {results.length > 0 && (
          <div className="hidden md:flex items-center justify-between px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
            <span>{results.length} result{results.length !== 1 ? "s" : ""}</span>
            <span>Click to view sale details</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Hook to open search overlay with Cmd+K / Ctrl+K
 */
export function useSearchShortcut(onOpen: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onOpen]);
}
