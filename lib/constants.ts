/**
 * Maximum items per trade
 */
export const MAX_ITEMS_PER_TRADE = 10;

/**
 * Authorized user emails from the prototype
 */
export const ALLOWED_EMAILS = [
  "sophie@club19london.com",
  "hope@club19london.com",
  "maryclair@club19london.com",
  "oliver@converso.uk",
  "alys@sketch24ltd.com",
];

/**
 * Check if a user email is authorized
 */
export function isAuthorizedUser(email?: string | null): boolean {
  if (!email) return false;
  return ALLOWED_EMAILS.includes(email.toLowerCase());
}

/**
 * Xero internal tax codes (from prototype)
 */
export const TAX_CODES = {
  TAX_20: "OUTPUT2", // 20% VAT on Income
  TAX_ZERO: "ZERORATEDOUTPUT", // Zero Rated Income 0%
} as const;

/**
 * Webhook URLs from prototype
 */
export const WEBHOOKS = {
  AUDIT_LOG: "https://hook.eu2.make.com/YOUR_AUDIT_WEBHOOK_ID",
  XERO_INVOICE: "https://hook.eu2.make.com/YOUR_XERO_INVOICE_WEBHOOK_ID",
  XERO_CONTACTS: "https://hook.eu2.make.com/YOUR_XERO_CONTACTS_WEBHOOK_ID",
} as const;

/**
 * Supported currencies
 */
export const CURRENCIES = [
  { code: "GBP", symbol: "£" },
  { code: "USD", symbol: "$" },
  { code: "EUR", symbol: "€" },
  { code: "CHF", symbol: "CHF" },
  { code: "JPY", symbol: "¥" },
] as const;

/**
 * Product brands for Deal Studio
 */
export const BRANDS = [
  "Hermès",
  "Chanel",
  "Dior",
  "Louis Vuitton",
  "Bottega Veneta",
  "Alaïa",
  "Gucci",
  "Loro Piana",
  "The Row",
  "Emilio Pucci",
  "Rolex",
  "Patek Philippe",
  "Audemars Piguet",
  "Cartier",
  "Van Cleef & Arpels",
  "Other",
] as const;

/**
 * Product categories for Deal Studio
 */
export const CATEGORIES = [
  "Bags",
  "Watches",
  "Shoes",
  "RTW",
  "Jewelry",
  "Accessories",
  "Other",
] as const;

/**
 * Popular countries for quick selection
 */
export const POPULAR_COUNTRIES = [
  "United Kingdom",
  "France",
  "Italy",
  "United States",
  "United Arab Emirates",
  "Hong Kong",
  "Switzerland",
];

/**
 * Full list of countries for supplier/buyer selection
 */
export const COUNTRIES = [
  "Afghanistan",
  "Albania",
  "Algeria",
  "Andorra",
  "Angola",
  "Argentina",
  "Armenia",
  "Australia",
  "Austria",
  "Azerbaijan",
  "Bahamas",
  "Bahrain",
  "Bangladesh",
  "Barbados",
  "Belarus",
  "Belgium",
  "Belize",
  "Benin",
  "Bhutan",
  "Bolivia",
  "Bosnia and Herzegovina",
  "Botswana",
  "Brazil",
  "Brunei",
  "Bulgaria",
  "Burkina Faso",
  "Burundi",
  "Cambodia",
  "Cameroon",
  "Canada",
  "Cape Verde",
  "Central African Republic",
  "Chad",
  "Chile",
  "China",
  "Colombia",
  "Comoros",
  "Congo",
  "Costa Rica",
  "Croatia",
  "Cuba",
  "Cyprus",
  "Czech Republic",
  "Denmark",
  "Djibouti",
  "Dominica",
  "Dominican Republic",
  "East Timor",
  "Ecuador",
  "Egypt",
  "El Salvador",
  "Equatorial Guinea",
  "Eritrea",
  "Estonia",
  "Ethiopia",
  "Fiji",
  "Finland",
  "France",
  "Gabon",
  "Gambia",
  "Georgia",
  "Germany",
  "Ghana",
  "Greece",
  "Grenada",
  "Guatemala",
  "Guinea",
  "Guinea-Bissau",
  "Guyana",
  "Haiti",
  "Honduras",
  "Hong Kong",
  "Hungary",
  "Iceland",
  "India",
  "Indonesia",
  "Iran",
  "Iraq",
  "Ireland",
  "Israel",
  "Italy",
  "Jamaica",
  "Japan",
  "Jordan",
  "Kazakhstan",
  "Kenya",
  "Kiribati",
  "North Korea",
  "South Korea",
  "Kuwait",
  "Kyrgyzstan",
  "Laos",
  "Latvia",
  "Lebanon",
  "Lesotho",
  "Liberia",
  "Libya",
  "Liechtenstein",
  "Lithuania",
  "Luxembourg",
  "Madagascar",
  "Malawi",
  "Malaysia",
  "Maldives",
  "Mali",
  "Malta",
  "Marshall Islands",
  "Mauritania",
  "Mauritius",
  "Mexico",
  "Micronesia",
  "Moldova",
  "Monaco",
  "Mongolia",
  "Montenegro",
  "Morocco",
  "Mozambique",
  "Myanmar",
  "Namibia",
  "Nauru",
  "Nepal",
  "Netherlands",
  "New Zealand",
  "Nicaragua",
  "Niger",
  "Nigeria",
  "Norway",
  "Oman",
  "Pakistan",
  "Palau",
  "Panama",
  "Papua New Guinea",
  "Paraguay",
  "Peru",
  "Philippines",
  "Poland",
  "Portugal",
  "Qatar",
  "Romania",
  "Russia",
  "Rwanda",
  "Saint Kitts and Nevis",
  "Saint Lucia",
  "Saint Vincent and the Grenadines",
  "Samoa",
  "San Marino",
  "Sao Tome and Principe",
  "Saudi Arabia",
  "Senegal",
  "Serbia",
  "Seychelles",
  "Sierra Leone",
  "Singapore",
  "Slovakia",
  "Slovenia",
  "Solomon Islands",
  "Somalia",
  "South Africa",
  "South Sudan",
  "Spain",
  "Sri Lanka",
  "Sudan",
  "Suriname",
  "Sweden",
  "Switzerland",
  "Syria",
  "Taiwan",
  "Tajikistan",
  "Tanzania",
  "Thailand",
  "Togo",
  "Tonga",
  "Trinidad and Tobago",
  "Tunisia",
  "Turkey",
  "Turkmenistan",
  "Tuvalu",
  "Uganda",
  "Ukraine",
  "United Arab Emirates",
  "United Kingdom",
  "United States",
  "Uruguay",
  "Uzbekistan",
  "Vanuatu",
  "Vatican City",
  "Venezuela",
  "Vietnam",
  "Yemen",
  "Zambia",
  "Zimbabwe",
];

/**
 * Tax scenarios from the prototype logic
 */
export type InvoiceScenario = {
  taxLiability: string;
  note?: string;
  brandTheme: string;
  amountsAre: string;
  accountCode: string;
  taxType: string;
  taxLabel: string;
  vatReclaim: string;
};

/**
 * Get invoice configuration based on user selections
 * This is the exact logic from the prototype
 */
export function getInvoiceResult(
  itemLocation: string | null,
  clientLocation: string | null,
  purchaseType?: string | null,
  shippingOption?: string | null,
  directShip?: string | null,
  insuranceLanded?: string | null,
): InvoiceScenario | null {
  const { TAX_20, TAX_ZERO } = TAX_CODES;

  /* -----------------------------------------------
     UK Item → UK Client
  ----------------------------------------------- */
  if (itemLocation === "uk" && clientLocation && purchaseType) {
    const scenarios: Record<string, InvoiceScenario> = {
      "uk-retail": {
        taxLiability:
          "Full price of item including VAT on first line\n+ Service Fee on second line",
        brandTheme: "CN 20% VAT",
        amountsAre: "Inclusive",
        accountCode: "425",
        taxType: TAX_20,
        taxLabel: "20% VAT on Income",
        vatReclaim: "Business reclaims VAT from original purchase",
      },
      "uk-margin": {
        taxLiability: "Item is purchased on UK margin rule",
        brandTheme: "CN Margin Scheme",
        amountsAre: "Inclusive",
        accountCode: "424",
        taxType: TAX_ZERO,
        taxLabel: "Zero Rated Income 0%",
        vatReclaim: "None",
      },
      "outside-retail": {
        taxLiability:
          "Full price of item including VAT on first line\n+ Service Fee on second line",
        brandTheme: "CN Export Sales",
        amountsAre: "Exclusive",
        accountCode: "423",
        taxType: TAX_ZERO,
        taxLabel: "Zero Rated Income 0%",
        vatReclaim: "Business reclaims VAT from original purchase",
      },
      "outside-margin": {
        taxLiability: "Item is purchased on UK margin rule",
        brandTheme: "CN Export Sales",
        amountsAre: "Exclusive",
        accountCode: "423",
        taxType: TAX_ZERO,
        taxLabel: "Zero Rated Income 0%",
        vatReclaim: "None",
      },
    };

    return scenarios[`${clientLocation}-${purchaseType}`] || null;
  }

  /* -----------------------------------------------
     Item Outside → UK Client
  ----------------------------------------------- */
  if (itemLocation === "outside" && clientLocation === "uk") {
    // Cannot ship OR cannot direct ship
    if (
      shippingOption === "no" ||
      (shippingOption === "yes" && directShip === "no")
    ) {
      return {
        taxLiability: "Full VAT needs adding to Cost and Sale Price",
        note: "Item needs to come to UK",
        brandTheme: "CN 20% VAT",
        amountsAre: "Inclusive",
        accountCode: "425",
        taxType: TAX_20,
        taxLabel: "20% VAT on Income",
        vatReclaim: "None",
      };
    }

    // Shipping allowed AND direct ship
    if (shippingOption === "yes" && directShip === "yes" && insuranceLanded) {
      const landed = insuranceLanded === "yes";
      return {
        taxLiability: landed
          ? "No liability, provide client item price plus margin plus delivery"
          : "Full VAT needs adding to Cost and Sale Price",
        note: landed ? undefined : "Item needs to come to UK",
        brandTheme: landed ? "CN Export Sales" : "CN 20% VAT",
        amountsAre: "Inclusive",
        accountCode: landed ? "423" : "425",
        taxType: landed ? TAX_ZERO : TAX_20,
        taxLabel: landed ? "Zero Rated Income 0%" : "20% VAT on Income",
        vatReclaim: "None",
      };
    }
  }

  /* -----------------------------------------------
     Outside → Outside (export)
  ----------------------------------------------- */
  if (itemLocation === "outside" && clientLocation === "outside") {
    return {
      taxLiability:
        "No liability, provide client item price plus margin plus delivery",
      brandTheme: "CN Export Sales",
      amountsAre: "Inclusive",
      accountCode: "423",
      taxType: TAX_ZERO,
      taxLabel: "Zero Rated Income 0%",
      vatReclaim: "None",
    };
  }

  return null;
}
