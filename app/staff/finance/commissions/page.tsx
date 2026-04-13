/**
 * Club 19 Sales OS — Finance Commissions Page (WS4)
 *
 * Per-shopper commission breakdown with flat-rate band calculation.
 * Shows cumulative profit, current band, commission amount, new client
 * bonus, and per-sale detail table with running total.
 */

"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { ErrorBlock } from "@/components/ui/ErrorBlock";
import {
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Award,
  Truck,
  AlertCircle,
} from "lucide-react";
import type { CommissionResult, SaleCommissionDetail, CommissionBand } from "@/lib/calculations/commission";

// ============================================================================
// TYPES
// ============================================================================

interface CommissionsResponse {
  month: string;
  shoppers: CommissionResult[];
}

// ============================================================================
// HELPERS
// ============================================================================

function formatGBP(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function monthLabel(monthStr: string): string {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function bandLabel(band: CommissionBand): string {
  const min = band.min >= 1000 ? `£${(band.min / 1000).toFixed(0)}K` : `£${band.min}`;
  if (band.max === Infinity) return `${min}+`;
  const max = band.max >= 1000 ? `£${(band.max / 1000).toFixed(0)}K` : `£${band.max}`;
  return `${min}–${max}`;
}

// ============================================================================
// COMPONENTS
// ============================================================================

function ShopperCard({ result }: { result: CommissionResult }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">{result.shopperName}</h3>
          <div className="flex items-center gap-2">
            {result.deliveredSaleCount < result.totalSales && (
              <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
                {result.totalSales - result.deliveredSaleCount} undelivered
              </span>
            )}
            <span className="text-xs text-gray-500">
              {result.deliveredSaleCount} delivered sale{result.deliveredSaleCount !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <div>
            <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              Cumulative Profit
            </div>
            <div className="text-lg font-bold text-gray-900">
              {formatGBP(result.cumulativeProfit)}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Current Band</div>
            <div className="text-lg font-bold text-gray-900">
              {result.currentBand ? (
                <>
                  {formatPercent(result.commissionRate)}
                  <span className="text-xs font-normal text-gray-400 ml-1">
                    ({bandLabel(result.currentBand)})
                  </span>
                </>
              ) : (
                <span className="text-gray-400">—</span>
              )}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Commission</div>
            <div className="text-lg font-bold text-blue-600">
              {formatGBP(result.commissionAmount)}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
              <Award className="w-3 h-3" />
              New Client Bonus
            </div>
            <div className="text-lg font-bold text-purple-600">
              {result.newClientBonusAmount > 0
                ? formatGBP(result.newClientBonusAmount)
                : "—"}
            </div>
          </div>
        </div>

        {/* Total payable */}
        <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
          <span className="text-sm font-medium text-green-800">Total Payable</span>
          <span className="text-xl font-bold text-green-700">
            {formatGBP(result.totalPayable)}
          </span>
        </div>
      </div>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-center gap-1 py-2.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 border-t border-gray-100 transition-colors"
      >
        {expanded ? (
          <>
            Hide sales <ChevronUp className="w-4 h-4" />
          </>
        ) : (
          <>
            Show {result.deliveredSaleCount} sale{result.deliveredSaleCount !== 1 ? "s" : ""}{" "}
            <ChevronDown className="w-4 h-4" />
          </>
        )}
      </button>

      {/* Sales table */}
      {expanded && (
        <div className="border-t border-gray-200 overflow-x-auto">
          {result.sales.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-500">
              <Truck className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              No delivered sales this month.
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Invoice</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Sell</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Buy</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Gross</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">VAT Due</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Costs</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Comm. Profit</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Running Total</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">New</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {result.sales.map((sale: SaleCommissionDetail) => (
                  <tr key={sale.saleId} className={sale.commissionableProfit <= 0 ? "bg-red-50/50" : ""}>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{formatDate(sale.saleDate)}</td>
                    <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{sale.invoiceNumber}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap max-w-[120px] truncate">{sale.buyerName}</td>
                    <td className="px-3 py-2 text-right text-gray-900 whitespace-nowrap">{formatGBP(sale.sellPrice)}</td>
                    <td className="px-3 py-2 text-right text-gray-900 whitespace-nowrap">{formatGBP(sale.buyPrice)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <span className={sale.grossProfit >= 0 ? "text-gray-900" : "text-red-600"}>
                        {formatGBP(sale.grossProfit)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500 whitespace-nowrap">
                      {sale.vatDue > 0 ? formatGBP(sale.vatDue) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500 whitespace-nowrap">
                      {sale.totalCosts > 0 ? formatGBP(sale.totalCosts) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                      <span className={sale.commissionableProfit > 0 ? "text-green-700" : "text-red-600"}>
                        {formatGBP(sale.commissionableProfit)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-blue-700 whitespace-nowrap">
                      {formatGBP(sale.cumulativeProfit)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {sale.isNewClient && (
                        <span className="inline-block px-1.5 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 rounded">
                          NEW
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// PAGE
// ============================================================================

export default function FinanceCommissionsPage() {
  const [data, setData] = useState<CommissionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/finance/commissions?month=${month}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to load commissions");
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || "Failed to load commission data");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  return (
    <div>
      <PageHeader
        title="Commissions"
        subtitle="Per-shopper commission calculation — flat-rate bands on cumulative monthly profit"
      />

      {/* Month selector */}
      <div className="flex items-center justify-center gap-4 mb-6">
        <button
          onClick={() => shiftMonth(-1)}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <span className="text-lg font-semibold text-gray-900 min-w-[180px] text-center">
          {monthLabel(month)}
        </span>
        <button
          onClick={() => shiftMonth(1)}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <ChevronRight className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {loading && <LoadingBlock message="Calculating commissions..." />}

      {error && <ErrorBlock message={error} onRetry={fetchData} />}

      {!loading && !error && data && (
        <div className="space-y-6">
          {data.shoppers.map((result) => (
            <ShopperCard key={result.shopperId} result={result} />
          ))}

          {/* Delivery gate info */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-700">
              <p className="font-medium mb-1">Commission rules</p>
              <ul className="list-disc list-inside space-y-0.5 text-xs">
                <li>Only delivered sales (delivery confirmed) are included in commission calculations.</li>
                <li>Commission rate is flat — the band the cumulative total falls into applies to the entire amount.</li>
                <li>New client bonus: 10% of commissionable profit on first-purchase sales.</li>
                <li>MC: commission on net profit (VAT due on margin scheme sales is deducted).</li>
                <li>Hope: commission on gross profit (VAT is not deducted).</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
