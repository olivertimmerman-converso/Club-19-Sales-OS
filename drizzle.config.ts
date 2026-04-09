import dotenv from "dotenv";
import path from "path";

// Load .env.local so drizzle-kit can access XATA_POSTGRES_URL
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.XATA_POSTGRES_URL!,
  },
  // Explicit table allowlist — prevents drizzle-kit from touching Neon's
  // system views (e.g. pg_stat_statements_info) or any other objects in the
  // public schema we don't manage. Without this, push tries to drop them.
  tablesFilter: [
    "shoppers",
    "buyers",
    "suppliers",
    "introducers",
    "commission_bands",
    "sales",
    "errors",
    "payment_schedule",
    "line_items",
    "legacy_suppliers",
    "legacy_clients",
    "legacy_trades",
  ],
});
