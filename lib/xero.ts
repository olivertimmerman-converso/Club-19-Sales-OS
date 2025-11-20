import { WEBHOOKS } from './constants'
import { InvoiceScenario } from './constants'

/**
 * Xero contact result from search
 */
export type XeroContact = {
  Name: string
  ContactID?: string
  EmailAddress?: string
}

/**
 * Fetch Xero contacts via Make webhook
 * Exact implementation from prototype
 */
export async function fetchXeroContacts(query: string): Promise<XeroContact[]> {
  try {
    const response = await fetch(WEBHOOKS.XERO_CONTACTS, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    })

    const data = await response.json()
    return data.contacts || []
  } catch (err) {
    console.error('Contact search error:', err)
    return []
  }
}

/**
 * Invoice data payload for Xero
 */
export type XeroInvoicePayload = {
  accountCode: string
  taxType: string
  taxLabel: string
  brandTheme: string
  amountsAre: string
  lineAmountTypes: string
  taxLiability: string
  vatReclaim: string
  customerName: string
  itemDescription: string
  price: number
  currency: string
  dueDate: string
  timestamp: string
}

/**
 * Map UI values to Xero's LineAmountTypes API values
 */
const LINE_AMOUNT_TYPE_MAP: Record<string, string> = {
  Inclusive: 'Inclusive',
  Exclusive: 'Exclusive',
  'No tax': 'NoTax',
  NoTax: 'NoTax',
  None: 'NoTax',
}

/**
 * Response from Xero invoice creation
 */
export type XeroInvoiceResponse = {
  status: string
  invoiceId?: string
  invoiceNumber?: string
  contactName?: string
  total?: string | number
  amountDue?: string | number
  invoiceUrl?: string
  taxSummary?: string
}

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
  dueDate: string
): Promise<XeroInvoiceResponse> {
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
  }

  const response = await fetch(WEBHOOKS.XERO_INVOICE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(invoiceData),
  })

  if (!response.ok) {
    throw new Error('Xero creation failed')
  }

  const data = await response.json()
  return data as XeroInvoiceResponse
}
