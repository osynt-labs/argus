import { defineConfig } from "prisma/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import { Pool } from "@neondatabase/serverless";

export default defineConfig({
  earlyAccess: true,
  schema: "./prisma/schema.prisma",
  migrate: {
    async adapter() {
      const pool = new Pool({
        connectionString:
          process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
      });
      return new PrismaNeon(pool);
    },
  },
});
