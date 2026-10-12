import "server-only";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

/**
 * Prisma runs on node-postgres (driver adapter) instead of its built-in connection pool.
 *
 * Neon closes idle connections (compute auto-suspend, pooler idle timeouts). Prisma's
 * built-in pool only notices when it reuses a dead socket, which logs
 * `Error in PostgreSQL connection: Error { kind: Closed }` and can fail the next query.
 * pg's Pool retires idle connections itself (idleTimeoutMillis), drops connections the
 * server closed without crashing, and opens fresh ones on demand.
 */
/**
 * pg already treats sslmode=require/prefer/verify-ca as verify-full (full certificate check)
 * and warns about it. Say verify-full explicitly: same security, no warning. Neon's
 * certificates are publicly trusted, so verification succeeds.
 */
function connectionString(): string | undefined {
  return process.env.DATABASE_URL?.replace(/([?&]sslmode=)(require|prefer|verify-ca)\b/, "$1verify-full");
}

function createClient(): PrismaClient {
  const pool = new Pool({
    connectionString: connectionString(),
    max: Number(process.env.DATABASE_POOL_MAX) || 5,
    // Close our idle connections well before Neon would close them for us.
    idleTimeoutMillis: 30_000,
    // Neon may need a few seconds to wake a suspended compute.
    connectionTimeoutMillis: 15_000,
    keepAlive: true,
  });
  // A server-closed idle connection is expected with Neon: pg removes it from the pool.
  pool.on("error", (err) => {
    if (process.env.NODE_ENV === "development") console.warn("[db] idle connection closed:", err.message);
  });

  const adapter = new PrismaPg(pool, {
    disposeExternalPool: true,
    onPoolError: (err) => console.warn("[db] pool error:", err.message),
  });
  return new PrismaClient({
    adapter,
    // Prisma's defaults (2s to start, 5s to finish an interactive transaction) are too tight
    // for a remote database: a check-in with a backdated move-in creates several months of
    // rent in one transaction, and each round trip to Neon can take a few hundred ms.
    transactionOptions: { maxWait: 10_000, timeout: 30_000 },
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];
