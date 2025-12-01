import { WEBHOOKS } from "./constants";
import { InvoiceScenario } from "./constants";

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
      console.error("[XERO BUYERS] API error:", response.status, errorData);

      // Re-throw connection errors so UI can show reconnect banner
      if (errorData.action === "connect_xero" || errorData.action === "reconnect_xero") {
        throw new Error(errorData.message || "Xero not connected");
      }

      return [];
    }

    const data = await response.json();
    return data.contacts || [];
  } catch (err) {
    console.error("[XERO BUYERS] Search error:", err);
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
      console.error("[XERO SUPPLIERS] API error:", response.status, errorData);

      // Re-throw connection errors so UI can show reconnect banner
      if (errorData.action === "connect_xero" || errorData.action === "reconnect_xero") {
        throw new Error(errorData.message || "Xero not connected");
      }

      return [];
    }

    const data = await response.json();
    return data.contacts || [];
  } catch (err) {
    console.error("[XERO SUPPLIERS] Search error:", err);
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
      console.error("Xero contacts API error:", response.status, await response.text());
      return [];
    }

    const data = await response.json();
    return data.contacts || [];
  } catch (err) {
    console.error("Contact search error:", err);
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
 * Send invoice to Xero via Make webhook
 * Exact implementation from prototype
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
