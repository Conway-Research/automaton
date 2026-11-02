import fs from "node:fs";
import path from "node:path";
import Database, { type Database as SqliteDatabase } from "better-sqlite3";
import { StrategySeriesStore } from "../revenue/strategy-series.js";

/** Separate marked research database. Never initializes or migrates a user's existing DB. */
export function openStrategySeries(file: string, create = false): {db:SqliteDatabase;store:StrategySeriesStore} {
  const resolved = path.resolve(file);
  if (create) {
    fs.mkdirSync(path.dirname(resolved), {recursive:true});
    fs.closeSync(fs.openSync(resolved,"wx"));
  } else {
    const check = new Database(resolved,{readonly:true,fileMustExist:true});
    try {
      if (!check.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='strategy_workspace'").get() ||
          (check.prepare("SELECT mode FROM strategy_workspace WHERE id=1").get() as {mode:string}|undefined)?.mode !== "paper-research") throw new Error("Not a marked strategy research database");
    } finally {check.close();}
  }
  const db = new Database(resolved,{fileMustExist:true});
  try {
    db.pragma("journal_mode=WAL");db.pragma("synchronous=FULL");db.pragma("foreign_keys=ON");db.pragma("busy_timeout=5000");
    if (create) db.exec("CREATE TABLE strategy_workspace(id INTEGER PRIMARY KEY CHECK(id=1),mode TEXT NOT NULL); INSERT INTO strategy_workspace VALUES(1,'paper-research')");
    const store=new StrategySeriesStore(db);
    return {db,store};
  } catch(error) {db.close();throw error;}
}
