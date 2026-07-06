import fs from "fs";
import path from "path";
import type {
  CatalogItem, Customer, Db, Order, Product, Rider, Shop, StateConfig,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

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
const g = globalThis as unknown as { __deliveryDb?: Db };

export function getDb(): Db {
  if (!g.__deliveryDb) {
    if (fs.existsSync(DB_FILE)) {
      g.__deliveryDb = JSON.parse(fs.readFileSync(DB_FILE, "utf-8")) as Db;
    } else {
      g.__deliveryDb = buildFresh();
      saveDb();
    }
  }
  return g.__deliveryDb;
}

export function saveDb(): void {
  if (!g.__deliveryDb) return;
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(g.__deliveryDb, null, 1), "utf-8");
  } catch {
    // Read-only filesystem (e.g. Vercel): state stays in-memory only,
    // resetting to seed data whenever the serverless instance recycles.
  }
}

/** Reset live state back to the generated seed data (admin demo control). */
export function resetDb(): Db {
  g.__deliveryDb = buildFresh();
  saveDb();
  return g.__deliveryDb;
}
