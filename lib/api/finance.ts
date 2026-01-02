/**
 * Club 19 Sales OS - Finance API Client
 *
 * Wrapper functions for finance-related backend endpoints
 */

"use client";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface LockResult {
  sale_id: string;
  sale_reference: string;
  status: "locked" | "failed";
  error?: string;
}

export interface LockPaidSalesResponse {
  total_paid: number;
  total_locked: number;
  total_failed: number;
  results: LockResult[];
}

export interface PayCommissionResult {
  sale_id: string;
  sale_reference: string;
  status: "commission_paid" | "failed";
  error?: string;
}

export interface PayCommissionsResponse {
  total_locked: number;
  total_commission_paid: number;
  total_failed: number;
  results: PayCommissionResult[];
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

export interface OverdueSale {
  sale_id: string;
  sale_reference: string;
  buyer_name: string;
  shopper_name: string;
  sale_amount_inc_vat: number;
  invoice_due_date: Date | null | undefined;
  days_overdue: number;
  isPaid: boolean;
  status: string;
  errors: ErrorRecord[];
}

export interface OverdueSalesResponse {
  total_overdue: number;
  overdue_sales: OverdueSale[];
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Lock all paid sales (end-of-month commission lock)
 *
 * @returns LockPaidSalesResponse
 * @throws Error if request fails
 */
export async function lockPaidSales(): Promise<LockPaidSalesResponse> {
  const response = await fetch("/api/finance/lock-paid-sales", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to lock paid sales");
  }

  return response.json();
}

/**
 * Pay commissions for all locked sales
 *
 * @returns PayCommissionsResponse
 * @throws Error if request fails
 */
export async function payCommissions(): Promise<PayCommissionsResponse> {
  const response = await fetch("/api/finance/pay-commissions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to pay commissions");
  }

  return response.json();
}

/**
 * Get list of overdue sales
 *
 * @returns OverdueSalesResponse
 * @throws Error if request fails
 */
export async function getOverdueSales(): Promise<OverdueSalesResponse> {
  const response = await fetch("/api/finance/overdue-sales", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch overdue sales");
  }

  return response.json();
}
