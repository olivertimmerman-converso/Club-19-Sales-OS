import {
  Trade,
  TradeItem,
  Buyer,
  PaymentMethod,
  TradeSource,
} from "@/lib/types/invoice";
import { calculateImpliedCosts } from "./implied-costs";
import { TradeSchema } from "@/lib/schemas/trade";

/**
 * Build a complete Trade payload from wizard state
 *
 * Validates the trade with Zod before returning
 */
export function buildTradePayload(args: {
  buyer: Buyer;
  items: TradeItem[];
  paymentMethod: PaymentMethod;
  deliveryCountry: string;
  dueDate: string;
  notes?: string;
  estimatedImportExportGBP?: number | null;
  importVAT?: number | null;
}): Trade {
  const { buyer, items, paymentMethod, deliveryCountry, dueDate, notes, estimatedImportExportGBP, importVAT } = args;

  // Generate trade ID and timestamp
  const tradeId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  // Calculate implied costs
  const impliedCosts = calculateImpliedCosts({
    items,
    paymentMethod,
    deliveryCountry,
  });

  // Compute gross margin (GBP only for v1)
  let grossMarginGBP = 0;
  for (const item of items) {
    if (item.buyCurrency === "GBP" && item.sellCurrency === "GBP") {
      const itemMargin = (item.sellPrice - item.buyPrice) * item.quantity;
      grossMarginGBP += itemMargin;
    }
  }
  grossMarginGBP = parseFloat(grossMarginGBP.toFixed(2));

  // Compute commissionable margin (subtract implied costs AND import/export AND import VAT)
  const importExportCost = estimatedImportExportGBP ?? 0;
  const importVATCost = importVAT ?? 0;
  const commissionableMarginGBP = parseFloat(
    (grossMarginGBP - impliedCosts.total - importExportCost - importVATCost).toFixed(2),
  );

  // Build trade object
  const trade: Trade = {
    tradeId,
    createdAt,
    source: TradeSource.DEAL_STUDIO,
    buyer,
    items,
    paymentMethod,
    deliveryCountry,
    dueDate,
    notes,
    impliedCosts,
    grossMarginGBP,
    estimatedImportExportGBP: estimatedImportExportGBP ?? null,
    importVAT: importVAT ?? null,
    commissionableMarginGBP,
  };

  // Validate with Zod
  const validated = TradeSchema.parse(trade);

  return validated;
}
