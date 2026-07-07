import fs from "fs";
import path from "path";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type {
  CatalogItem, Customer, Db, Order, Product, Rider, Shop, StateConfig,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

// Preferred shared store: Vercel Postgres / Neon. Whichever integration you
// add on Vercel (Storage -> Postgres, or the Neon marketplace listing)
// injects one of these connection strings.
const PG_URL =
  process.env.POSTGRES_URL ??
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL_NON_POOLING;
const pgEnabled = Boolean(PG_URL);
const pgSql: NeonQueryFunction<false, false> | null = pgEnabled ? neon(PG_URL!) : null;
const PG_ROW_ID = "main";
let pgInit: Promise<void> | null = null;

async function ensurePgTable(): Promise<void> {
  if (!pgSql) return;
  if (!pgInit) {
    // table name is a fixed constant (PG_TABLE), never user input
    pgInit = pgSql`
      CREATE TABLE IF NOT EXISTS delivery_app_state (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.then(() => undefined);
  }
  await pgInit;
}

// Fallback shared store: Vercel KV / Upstash Redis over REST. Used only when
// Postgres isn't configured.
const KV_URL =
  process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN =
  process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const KV_KEY = "delivery-app:db";
const kvEnabled = !pgEnabled && Boolean(KV_URL && KV_TOKEN);

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf-8")) as T;
}

function buildFresh(): Db {
  const seed = readJson<{ customers: Customer[]; riders: Rider[]; orders: Order[] }>(
    "seed.json",
  );
  return {
    products: readJson<Product[]>("products.json"),
    shops: readJson<Shop[]>("shops.json"),
    catalogs: readJson<Record<string, CatalogItem[]>>("catalogs.json"),
    customers: seed.customers,
    riders: seed.riders,
    orders: seed.orders,
    stateConfig: readJson<StateConfig>("state-config.json"),
  };
}

// Survive Next.js dev-server module reloads.
const g = globalThis as unknown as {
  __deliveryDb?: Db;
  __deliveryDbLoadedAt?: number;
};

export function getDb(): Db {
  if (!g.__deliveryDb) {
    if (!pgEnabled && !kvEnabled && fs.existsSync(DB_FILE)) {
      g.__deliveryDb = JSON.parse(fs.readFileSync(DB_FILE, "utf-8")) as Db;
    } else {
      g.__deliveryDb = buildFresh();
      saveDb();
    }
    g.__deliveryDbLoadedAt = Date.now();
  }
  return g.__deliveryDb;
}

/**
 * Pull the latest shared copy before serving/mutating data.
 * Call with maxAgeMs=0 before mutations so we never clobber another
 * instance's recent writes with a stale copy. No-op without Postgres/KV.
 */
export async function ensureFresh(maxAgeMs = 2000): Promise<void> {
  if (!pgEnabled && !kvEnabled) {
    getDb();
    return;
  }
  const age = Date.now() - (g.__deliveryDbLoadedAt ?? 0);
  if (g.__deliveryDb && age < maxAgeMs) return;

  if (pgEnabled && pgSql) {
    try {
      await ensurePgTable();
      const rows = await pgSql`
        SELECT data FROM delivery_app_state WHERE id = ${PG_ROW_ID}
      `;
      if (rows.length) {
        g.__deliveryDb = rows[0].data as Db;
        g.__deliveryDbLoadedAt = Date.now();
        return;
      }
    } catch {
      // Postgres unreachable: fall through to whatever copy we have
    }
  } else if (kvEnabled) {
    try {
      const res = await fetch(`${KV_URL}/get/${KV_KEY}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` },
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as { result: string | null };
        if (data.result) {
          g.__deliveryDb = JSON.parse(data.result) as Db;
          g.__deliveryDbLoadedAt = Date.now();
          return;
        }
      }
    } catch {
      // KV unreachable: fall through to whatever copy we have
    }
  }

  if (!g.__deliveryDb) {
    g.__deliveryDb = buildFresh();
    g.__deliveryDbLoadedAt = Date.now();
    await persistDb();
  }
}

/** Best-effort local file persistence (dev). */
export function saveDb(): void {
  if (!g.__deliveryDb) return;
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(g.__deliveryDb, null, 1), "utf-8");
  } catch {
    // Read-only filesystem (e.g. Vercel): rely on Postgres/KV or memory.
  }
}

/**
 * Durable persistence after a mutation: local file + shared Postgres/KV
 * when configured. Mutation routes must await this before responding, so
 * the write is not lost when a serverless instance freezes.
 */
export async function persistDb(): Promise<void> {
  saveDb();
  if (!g.__deliveryDb) return;

  if (pgEnabled && pgSql) {
    try {
      await ensurePgTable();
      await pgSql`
        INSERT INTO delivery_app_state (id, data, updated_at)
        VALUES (${PG_ROW_ID}, ${JSON.stringify(g.__deliveryDb)}::jsonb, now())
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
      `;
      g.__deliveryDbLoadedAt = Date.now();
    } catch {
      // keep serving from memory; next mutation retries the push
    }
    return;
  }

  if (kvEnabled) {
    try {
      await fetch(`${KV_URL}/set/${KV_KEY}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${KV_TOKEN}` },
        body: JSON.stringify(g.__deliveryDb),
      });
      g.__deliveryDbLoadedAt = Date.now();
    } catch {
      // keep serving from memory; next mutation retries the push
    }
  }
}

/** Reset live state back to the generated seed data (admin demo control). */
export async function resetDb(): Promise<Db> {
  g.__deliveryDb = buildFresh();
  g.__deliveryDbLoadedAt = Date.now();
  await persistDb();
  return g.__deliveryDb;
}
