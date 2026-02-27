import Database from "better-sqlite3";
import type BetterSqlite3 from "better-sqlite3";
import { CREATE_TABLES, MIGRATION_V9, MIGRATION_V9_ALTER_CHILDREN_ROLE, MIGRATION_V10 } from "../../state/schema.js";

export type TestDatabase = BetterSqlite3.Database;

export function createInMemoryDb(): TestDatabase {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(CREATE_TABLES);
  db.exec(MIGRATION_V9);
  try { db.exec(MIGRATION_V9_ALTER_CHILDREN_ROLE); } catch { /* column may already exist */ }
  db.exec(MIGRATION_V10);
  return db;
}
