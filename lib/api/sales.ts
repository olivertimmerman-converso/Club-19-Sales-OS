/**
 * Club 19 Sales OS - Sales API Client
 *
 * Wrapper functions for sales-related backend endpoints
 */

"use client";

import { auth } from "@clerk/nextjs/server";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface SaleSummary {
  sale_id: string;
  sale_reference: string;
  buyer_name: string;
  supplier_name: string;
  shopper_name: string;
  introducer_name: string;
  buyer_type: string;
  authenticity_status: string;
  authenticity_risk: string;
  supplier_receipt_attached: boolean;
  status: string;
  isPaid: boolean;
  isLocked: boolean;
  canLock: boolean;
  canPayCommission: boolean;
  invoice_due_date: Date | null | undefined;
  xero_payment_date: Date | null | undefined;
  is_overdue: boolean;
  days_overdue: number;
  sale_amount_inc_vat: number;
  buy_price: number;
  commissionable_margin: number;
  commission_amount: number;
  margin_percent: number;
  errors: ErrorRecord[];
  warnings: ErrorRecord[];
  error_groups: Record<string, number>;
}

export interface ErrorRecord {
  id: string;
  error_type: string;
  error_group: string;
  severity: string;
  source: string;
  message: string[];
  metadata: Record<string, unknown>;
  triggered_by: string;
  timestamp: Date;
  resolved: boolean;
}

export interface SalesSummaryResponse {
  sales: SaleSummary[];
  count: number;
}

export interface AnalyticsOverview {
  total_sales_count: number;
  total_revenue_inc_vat: number;
  total_buy_cost: number;
  total_margin: number;
  average_margin_percent: number;
  count_paid: number;
  count_unpaid: number;
  count_overdue: number;
  end_client_sales_count: number;
  b2b_sales_count: number;
  authenticity_high_risk_count: number;
  authenticity_missing_receipt_count: number;
  errors_count_total: number;
  errors_by_group: Record<string, number>;
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Fetch complete sales summary with derived fields and errors
 *
 * @returns SalesSummaryResponse
 * @throws Error if request fails
 */
export async function getSalesSummary(): Promise<SalesSummaryResponse> {
  const response = await fetch("/api/sales/summary", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch sales summary");
  }

  return response.json();
}

/**
 * Fetch high-level analytics overview
 *
 * @returns AnalyticsOverview
 * @throws Error if request fails
 */
export async function getSalesAnalyticsOverview(): Promise<AnalyticsOverview> {
  const response = await fetch("/api/sales/analytics/overview", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch analytics overview");
  }

  return response.json();
}
