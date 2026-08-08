import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Supabase manages these schemas itself; never let migrations touch them.
  schemaFilter: ["public"],
  verbose: true,
  strict: true,
} satisfies Config;
