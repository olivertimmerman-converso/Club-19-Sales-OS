import { TradeItem, PaymentMethod } from "@/lib/types/invoice";

/**
 * Map a country string to a shipping region
 */
function mapCountryToRegion(
  country: string,
): "UK" | "EU" | "US" | "Asia" | "Other" {
  const normalized = country.toLowerCase();

  if (normalized === "uk" || normalized === "united kingdom") {
    return "UK";
  }

  if (
    ["france", "italy", "switzerland", "germany", "spain"].includes(normalized)
  ) {
    return "EU";
  }

  if (["usa", "united states", "us"].includes(normalized)) {
    return "US";
  }

  if (["japan", "hong kong", "singapore", "uae"].includes(normalized)) {
    return "Asia";
  }

  return "Other";
}

/**
 * Shipping cost averages (in GBP) by supplier region → delivery region
 */
const SHIPPING_COSTS_GBP: Record<string, number> = {
  UK_UK: 40,
  EU_UK: 140,
  Asia_UK: 180,
  US_UK: 160,
  UK_EU: 150,
  EU_EU: 100,
  Asia_EU: 200,
  US_EU: 180,
  UK_US: 170,
  EU_US: 190,
  Asia_US: 150,
  US_US: 80,
  UK_Asia: 180,
  EU_Asia: 200,
  Asia_Asia: 120,
  US_Asia: 150,
  DEFAULT: 130,
};

/**
 * Card fee configuration
 */
const CARD_FEE_PERCENT = 0.025; // 2.5%
const CARD_FEE_FLAT = 0.3; // £0.30

/**
 * Derive shipping route key from supplier country and delivery country
 */
function getShippingCost(
  supplierCountry: string,
  deliveryCountry: string,
): number {
  const supplierRegion = mapCountryToRegion(supplierCountry);
  const deliveryRegion = mapCountryToRegion(deliveryCountry);

  const routeKey = `${supplierRegion}_${deliveryRegion}`;
  return SHIPPING_COSTS_GBP[routeKey] || SHIPPING_COSTS_GBP.DEFAULT;
}

/**
 * Calculate implied costs for a trade
 *
 * Returns shipping cost, card fees, and total implied costs in GBP
 */
export function calculateImpliedCosts(params: {
  items: TradeItem[];
  paymentMethod: PaymentMethod;
  deliveryCountry: string;
}): {
  shipping: number;
  cardFees: number;
  total: number;
} {
  const { items, paymentMethod, deliveryCountry } = params;

  // Calculate shipping: use the maximum shipping cost across all items
  let maxShipping = 0;
  for (const item of items) {
    const shippingCost = getShippingCost(
      item.supplier.country,
      deliveryCountry,
    );
    maxShipping = Math.max(maxShipping, shippingCost);
  }

  // Calculate card fees if payment method is CARD
  let cardFees = 0;
  if (paymentMethod === PaymentMethod.CARD) {
    // Sum GBP sell amounts (v2 is GBP-only)
    let totalSellGBP = 0;
    for (const item of items) {
      totalSellGBP += item.sellPrice * item.quantity;
    }

    // Apply card fee formula
    if (totalSellGBP > 0) {
      cardFees = totalSellGBP * CARD_FEE_PERCENT + CARD_FEE_FLAT;
    }
  }

  return {
    shipping: maxShipping,
    cardFees: parseFloat(cardFees.toFixed(2)),
    total: parseFloat((maxShipping + cardFees).toFixed(2)),
  };
}
