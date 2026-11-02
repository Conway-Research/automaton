import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fork, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase } from "../state/database.js";
import { ModelRegistry } from "../inference/registry.js";
import { InferenceBudgetTracker } from "../inference/budget.js";
import { pendingInferenceCost } from "../inference/reservations.js";
import { DEFAULT_MODEL_STRATEGY_CONFIG } from "../inference/types.js";

interface Message { type: string; admitted?: number; denied?: number }
let directory: string;
let file: string;
let db: ReturnType<typeof createDatabase>;
const children: ChildProcess[] = [];
beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "aureus-process-budget-"));
  file = path.join(directory, "test.db");
  db = createDatabase(file);
  const registry = new ModelRegistry(db.raw);
  registry.initialize();
  registry.upsert({ ...registry.get("gpt-5-mini")!, costPer1kInput: 0, costPer1kOutput: 1000 });
});
async function terminate(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>(resolve => {
    child.once("exit", () => resolve());
    child.kill("SIGKILL");
  });
}
afterEach(async () => {
  await Promise.all(children.splice(0).map(terminate));
  db.close();
  rmSync(directory, { recursive: true, force: true });
});
function worker(mode: "run" | "crash", limit: number) {
  // Explicit minimal environment: never pass API keys or wallet settings.
  const env: NodeJS.ProcessEnv = {};
  for (const key of ["SystemRoot", "WINDIR", "PATH", "TEMP", "TMP"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  const child = fork(fileURLToPath(new URL("./fixtures/reservation-process.ts", import.meta.url)),
    [file, mode, String(limit)], { execArgv: ["--import", "tsx"], env, stdio: ["ignore", "ignore", "ignore", "ipc"] });
  children.push(child);
  const messages: Message[] = [];
  const listeners = new Set<() => void>();
  let failure = "";
  child.on("message", message => { messages.push(message as Message); listeners.forEach(f => f()); });
  child.on("error", () => { failure = "Child process failed to start"; listeners.forEach(f => f()); });
  child.on("exit", () => { failure = "Child exited before expected message"; listeners.forEach(f => f()); });
  function wait(type: string): Promise<Message> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => finish(new Error(`Timed out waiting for ${type}`)), 20000);
      const finish = (result: Message | Error) => {
        clearTimeout(timeout); listeners.delete(check);
        if (result instanceof Error) reject(result); else resolve(result);
      };
      const check = () => {
        const message = messages.find(m => m.type === type);
        if (message) finish(message);
        else if (failure || messages.some(m => m.type === "failed")) finish(new Error(failure || "Fixture failed"));
      };
      listeners.add(check); check();
    });
  }
  return { child, wait, start: () => child.send({ type: "start" }) };
}
function costs() {
  return { spent: new InferenceBudgetTracker(db.raw, DEFAULT_MODEL_STRATEGY_CONFIG).getDailyCost(),
    held: pendingInferenceCost(db.raw) };
}
describe("cross-process inference budget durability", () => {
  it("serializes four independent routers with conflicting limits at the strictest 25-cent boundary", async () => {
    const workers = [25, 100, 200, 1000].map(limit => worker("run", limit));
    await Promise.all(workers.map(w => w.wait("ready")));
    workers.forEach(w => w.start());
    const results = await Promise.all(workers.map(w => w.wait("done")));
    expect(results.reduce((n, r) => n + r.admitted!, 0)).toBe(25);
    expect(results.reduce((n, r) => n + r.denied!, 0)).toBe(175);
    expect(costs()).toEqual({ spent: 25, held: 0 });
  });
  it("retains a killed provider's hold across reopen and denies replacement spending", async () => {
    const crashed = worker("crash", 1);
    await crashed.wait("ready"); crashed.start(); await crashed.wait("reserved");
    expect(costs()).toEqual({ spent: 0, held: 1 });
    await terminate(crashed.child);
    db.close(); db = createDatabase(file);
    const replacement = worker("run", 1);
    await replacement.wait("ready"); replacement.start();
    expect(await replacement.wait("done")).toMatchObject({ admitted: 0, denied: 50 });
    expect(costs()).toEqual({ spent: 0, held: 1 });
  });
});
