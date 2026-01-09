import * as logger from './logger';
import { WEBHOOKS } from "./constants";
import { InvoiceScenario } from "./constants";
import { roundCurrency } from "./utils/currency";

/**
 * Xero contact result from search
 */
export type XeroContact = {
  Name: string;
  ContactID?: string;
  EmailAddress?: string;
};

/**
 * Normalized contact from new API endpoints
 */
export type NormalizedContact = {
  contactId: string;
  name: string;
  email?: string;
  isCustomer: boolean;
  isSupplier: boolean;
};

/**
 * Fetch Xero BUYER contacts (customers only)
 * @param query Search term (minimum 2 characters)
 * @returns List of customer contacts
 */
export async function fetchXeroBuyers(query: string): Promise<NormalizedContact[]> {
  try {
    const response = await fetch(`/api/xero/contacts/buyers?query=${encodeURIComponent(query)}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      logger.error('XERO', 'Buyers API error', { status: response.status, errorData });

      // Re-throw connection errors so UI can show reconnect banner
      if (errorData.action === "connect_xero" || errorData.action === "reconnect_xero") {
        throw new Error(errorData.message || "Xero not connected");
      }

      return [];
    }

    const data = await response.json();
    return data.contacts || [];
  } catch (err) {
    logger.error('XERO', 'Buyers search error', { error: err as any } as any);
    throw err; // Re-throw to allow UI to handle connection errors
  }
}

/**
 * Fetch Xero SUPPLIER contacts (suppliers only)
 * @param query Search term (minimum 2 characters)
 * @returns List of supplier contacts
 */
export async function fetchXeroSuppliers(query: string): Promise<NormalizedContact[]> {
  try {
    const response = await fetch(`/api/xero/contacts/suppliers?query=${encodeURIComponent(query)}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      logger.error('XERO', 'Suppliers API error', { status: response.status, errorData });

      // Re-throw connection errors so UI can show reconnect banner
      if (errorData.action === "connect_xero" || errorData.action === "reconnect_xero") {
        throw new Error(errorData.message || "Xero not connected");
      }

      return [];
    }

    const data = await response.json();
    return data.contacts || [];
  } catch (err) {
    logger.error('XERO', 'Suppliers search error', { error: err as any } as any);
    throw err; // Re-throw to allow UI to handle connection errors
  }
}

/**
 * Fetch Xero contacts via Next.js API route (LEGACY - General search)
 * Calls Xero API directly (not via Make webhook)
 * @deprecated Use fetchXeroBuyers() or fetchXeroSuppliers() for better filtering
 */
export async function fetchXeroContacts(query: string): Promise<XeroContact[]> {
  try {
    const response = await fetch(`/api/xero/contacts?query=${encodeURIComponent(query)}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('XERO', 'Contacts API error', { status: response.status, error: errorText });
      return [];
    }

    const data = await response.json();
    return data.contacts || [];
  } catch (err) {
    logger.error('XERO', 'Contact search error', { error: err as any } as any);
    return [];
  }
}

/**
 * Invoice data payload for Xero
 */
export type XeroInvoicePayload = {
  accountCode: string;
  taxType: string;
  taxLabel: string;
  brandTheme: string;
  amountsAre: string;
  lineAmountTypes: string;
  taxLiability: string;
  vatReclaim: string;
  customerName: string;
  itemDescription: string;
  price: number;
  currency: string;
  dueDate: string;
  timestamp: string;
};

/**
 * Map UI values to Xero's LineAmountTypes API values
 */
const LINE_AMOUNT_TYPE_MAP: Record<string, string> = {
  Inclusive: "Inclusive",
  Exclusive: "Exclusive",
  "No tax": "NoTax",
  NoTax: "NoTax",
  None: "NoTax",
};

/**
 * Xero Invoice from API Response
 */
interface XeroInvoice {
  InvoiceID: string;
  InvoiceNumber: string;
  Type: string;
  Contact: {
    ContactID: string;
    Name: string;
  };
  DateString?: string;
  DueDateString?: string;
  Status: string;
  LineAmountTypes: string;
  LineItems: Array<{
    Description: string;
    Quantity: number;
    UnitAmount: number;
    AccountCode: string;
    TaxType: string;
    TaxAmount: number;
    LineAmount: number;
  }>;
  SubTotal: number;
  TotalTax: number;
  Total: number;
  AmountDue: number;
  CurrencyCode: string;
  BrandingThemeID?: string;
}

interface XeroInvoiceResponse {
  Invoices: XeroInvoice[];
}

/**
 * Line item for multi-line invoices
 */
export interface InvoiceLineItem {
  lineNumber: number;
  brand: string;
  category: string;
  description: string;
  quantity: number;
  buyPrice: number;
  sellPrice: number;
  lineTotal: number;
  lineMargin: number;
  supplierName?: string;
}

/**
 * Invoice creation payload
 * Supports both single-line (legacy) and multi-line invoices
 */
interface CreateInvoicePayload {
  buyerContactId: string;
  // Single-line (legacy) fields
  description?: string;
  finalPrice?: number;
  // Multi-line fields
  lineItems?: InvoiceLineItem[];
  // Common fields
  accountCode: string;
  taxType: string;
  brandingThemeId?: string;
  currency: string;
  lineAmountType: string;
}

/**
 * Create invoice directly in Xero using native API
 *
 * Features:
 * - Auto-generated invoice numbers (Xero handles this)
 * - Supports multi-line invoices (multiple items per invoice)
 * - Falls back to single-line for legacy compatibility
 * - Returns complete invoice object
 *
 * @param tenantId - Xero tenant/organization ID
 * @param accessToken - Valid OAuth access token
 * @param payload - Invoice creation payload
 * @returns Complete invoice object from Xero
 * @throws Error with structured message on failure
 */
export async function createXeroInvoice(
  tenantId: string,
  accessToken: string,
  payload: CreateInvoicePayload
): Promise<XeroInvoice> {
  // Determine if this is a multi-line or single-line invoice
  const isMultiLine = payload.lineItems && payload.lineItems.length > 0;

  logger.info('XERO', 'Creating invoice with payload', {
    contactId: payload.buyerContactId,
    isMultiLine,
    lineItemCount: payload.lineItems?.length || 1,
    currency: payload.currency,
    accountCode: payload.accountCode,
    taxType: payload.taxType,
  });

  // Build Xero line items array
  let xeroLineItems;

  if (isMultiLine && payload.lineItems) {
    // Multi-line invoice: one line item per product
    // CRITICAL: Round all currency values to prevent floating point errors (e.g., 24999.96 instead of 25000)
    xeroLineItems = payload.lineItems.map(item => ({
      Description: item.description,
      Quantity: item.quantity,
      UnitAmount: roundCurrency(item.sellPrice), // Unit price rounded to 2 decimal places
      AccountCode: payload.accountCode,
      TaxType: payload.taxType,
    }));

    logger.info('XERO', 'Multi-line invoice', {
      lineCount: xeroLineItems.length,
      totalAmount: roundCurrency(payload.lineItems.reduce((sum, item) => sum + roundCurrency(item.lineTotal), 0)),
    });
  } else {
    // Single-line (legacy) invoice
    // CRITICAL: Round all currency values to prevent floating point errors
    xeroLineItems = [
      {
        Description: payload.description || '',
        Quantity: 1,
        UnitAmount: roundCurrency(payload.finalPrice || 0),
        AccountCode: payload.accountCode,
        TaxType: payload.taxType,
      },
    ];
  }

  // Build Xero invoice payload
  // IMPORTANT: Do NOT include InvoiceNumber - Xero auto-generates it
  const xeroPayload = {
    Type: "ACCREC", // Accounts Receivable (sales invoice)
    Contact: {
      ContactID: payload.buyerContactId,
    },
    DueDate: new Date().toISOString().split("T")[0], // YYYY-MM-DD format (UTC today)
    LineAmountTypes: payload.lineAmountType, // "Inclusive" | "Exclusive" | "NoTax"
    LineItems: xeroLineItems,
    CurrencyCode: payload.currency,
    ...(payload.brandingThemeId && { BrandingThemeID: payload.brandingThemeId }),
  };

  logger.info('XERO', `Using due date: ${xeroPayload.DueDate}`);
  logger.info('XERO', 'Payload sent to Xero', xeroPayload);

  // Call Xero API
  const xeroUrl = "https://api.xero.com/api.xro/2.0/Invoices";
  const response = await fetch(xeroUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Xero-tenant-id": tenantId,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(xeroPayload),
  });

  logger.info('XERO', `Response status: ${response.status}`);

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('XERO', 'Xero API error', {
      status: response.status,
      statusText: response.statusText,
      error: errorText,
    });

    const error = new Error(`Xero API error: ${response.status} - ${response.statusText}`) as Error & { details?: string };
    error.details = errorText;
    throw error;
  }

  const data: XeroInvoiceResponse = await response.json();
  logger.info('XERO', 'Response received', { invoice: data as any } as any);

  if (!data.Invoices || data.Invoices.length === 0) {
    throw new Error("No invoice returned from Xero API");
  }

  const invoice = data.Invoices[0];
  logger.info('XERO', `Invoice created: ${invoice.InvoiceNumber} (ID: ${invoice.InvoiceID})`);

  return invoice;
}

/**
 * Send invoice to Xero via Make webhook (LEGACY)
 * @deprecated Use createXeroInvoice() for direct API integration
 */
export async function sendInvoiceToXero(
  result: InvoiceScenario,
  customerName: string,
  itemDescription: string,
  price: string,
  currency: string,
  dueDate: string,
): Promise<void> {
  const invoiceData: XeroInvoicePayload = {
    accountCode: result.accountCode,
    // Xero must receive taxType only (OUTPUT2 or ZERORATEDOUTPUT)
    taxType: result.taxType,
    // Include taxLabel only for human readability in Make (NOT used by Xero)
    taxLabel: result.taxLabel,
    brandTheme: result.brandTheme,
    amountsAre: result.amountsAre,
    // LineAmountTypes field for Xero API
    lineAmountTypes: LINE_AMOUNT_TYPE_MAP[result.amountsAre],
    taxLiability: result.taxLiability,
    vatReclaim: result.vatReclaim,
    customerName,
    itemDescription,
    price: parseFloat(price),
    currency,
    dueDate,
    timestamp: new Date().toISOString(),
  };

  const response = await fetch(WEBHOOKS.XERO_INVOICE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(invoiceData),
  });

  if (!response.ok) {
    throw new Error("Xero creation failed");
  }
}
