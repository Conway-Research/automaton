import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { ConwayClient } from "../types.js";
import { assertNoKnownSecrets } from "../observability/redaction.js";

export interface RuntimeBundle {
  version: 1;
  files: { path: string; content: string; sha256: string }[];
  sha256: string;
}
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const rootFiles = ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.json", "constitution.md"];
const required = ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.json", "src/index.ts", "src/replication/bootstrap.ts", "src/agent/genesis.ts"];
const allowed = (name: string) => rootFiles.includes(name) ||
  /^(src\/[A-Za-z0-9_./-]+\.ts|packages\/cli\/(package\.json|tsconfig\.json|src\/[A-Za-z0-9_./-]+\.ts))$/.test(name) &&
  !name.split("/").some(part => ["..", ".", "__tests__", "node_modules", "dist"].includes(part));

/** Operator-selected immutable release. Both the absolute path and manifest hash
 * are required. Invalid selection never silently falls back to upstream. These
 * host environment values are not inherited through Child Genesis. */
export function selectedRuntimeBundle(environment: NodeJS.ProcessEnv = process.env): RuntimeBundle | undefined {
  const file = environment.OBOLUS_CHILD_RUNTIME_BUNDLE;
  const expected = environment.OBOLUS_CHILD_RUNTIME_SHA256;
  if (file === undefined && expected === undefined) return undefined;
  if (!file || !path.isAbsolute(file) || !expected || !/^[a-f0-9]{64}$/.test(expected)) throw new Error("Invalid explicit child runtime selection");
  let descriptor: number | undefined;
  try {
    if (fs.lstatSync(file).isSymbolicLink()) throw new Error("Unsafe runtime file");
    descriptor = fs.openSync(file, "r");
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.size > 125_000_000) throw new Error("Invalid runtime file size");
    // Bound the read as well as the stat: a concurrently growing file must not
    // turn this admission step into an unbounded allocation/read.
    const bytes = Buffer.alloc(stat.size + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(descriptor, bytes, offset, bytes.length - offset, offset);
      if (count === 0) break;
      offset += count;
    }
    if (offset !== stat.size) throw new Error("Runtime file changed during read");
    const bundle = JSON.parse(bytes.subarray(0, offset).toString("utf8")) as RuntimeBundle;
    validateRuntimeBundle(bundle);
    if (bundle.sha256 !== expected) throw new Error("Runtime release mismatch");
    return bundle;
  } catch { throw new Error("Selected child runtime failed validation; provisioning denied"); }
  finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
}

/** Local source-only distribution. Never includes configuration, wallets,
 * backups, runtime databases, generated artifacts or installed dependencies.
 * Hashes detect corruption, not publisher authenticity. The caller must select
 * an operator-reviewed bundle produced from an accepted source tree. */
export function validateRuntimeBundle(bundle: RuntimeBundle): void {
  if (!bundle || bundle.version !== 1 || !Array.isArray(bundle.files) || !bundle.files.length || bundle.files.length > 2000) throw new Error("Invalid runtime bundle");
  const paths = new Set<string>(); let bytes = 0;
  for (const file of bundle.files) {
    if (!file || !allowed(file.path) || paths.has(file.path) || typeof file.content !== "string" ||
        file.content.length > 2_000_000 || digest(file.content) !== file.sha256) throw new Error("Unsafe or corrupt runtime bundle file");
    assertNoKnownSecrets(file.content);
    paths.add(file.path); bytes += Buffer.byteLength(file.content, "utf8");
  }
  if (bytes > 20_000_000 || required.some(file => !paths.has(file)) || digest(JSON.stringify(bundle.files)) !== bundle.sha256) throw new Error("Incomplete or corrupt runtime bundle");
}

export function createRuntimeBundle(root: string): RuntimeBundle {
  const files: RuntimeBundle["files"] = [];
  const include = (relative: string) => {
    const absolute = path.join(root, relative);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("Runtime source must be a regular file");
    const content = fs.readFileSync(absolute, "utf8");
    files.push({ path: relative, content, sha256: digest(content) });
  };
  const walk = (relative: string) => {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const name = `${relative}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error("Runtime source must not contain symlinks");
      if (entry.isDirectory()) { if (!["__tests__", "node_modules", "dist"].includes(entry.name)) walk(name); }
      else if (allowed(name)) include(name);
    }
  };
  rootFiles.forEach(name => { if (fs.existsSync(path.join(root, name))) include(name); });
  walk("src"); walk("packages/cli"); files.sort((a, b) => a.path.localeCompare(b.path, "en"));
  const bundle: RuntimeBundle = { version: 1, files, sha256: digest(JSON.stringify(files)) };
  validateRuntimeBundle(bundle); return bundle;
}

/** Executes only against an explicitly supplied scoped child client. Unit tests
 * use a mock. No clone, hosting, publication or credentials are required. */
export async function installRuntimeBundle(client: ConwayClient, input: RuntimeBundle): Promise<void> {
  const bundle = structuredClone(input); validateRuntimeBundle(bundle);
  // Never overlay an old checkout or follow its source symlinks.
  const directories = [...new Set(bundle.files.map(file => path.posix.dirname(file.path)))].filter(name => name !== ".");
  const prepare = await client.exec("test ! -e /root/automaton && mkdir -p /root/automaton " +
    directories.map(name => `/root/automaton/${name}`).join(" "), 30000);
  if (prepare.exitCode !== 0) throw new Error("Runtime bundle requires a fresh child installation directory");
  for (const file of bundle.files) {
    await client.writeFile(`/root/automaton/${file.path}`, file.content);
    if (digest(await client.readFile(`/root/automaton/${file.path}`)) !== file.sha256) throw new Error("Child runtime transfer integrity failed");
  }
  const result = await client.exec("cd /root/automaton && corepack pnpm install --frozen-lockfile && corepack pnpm run build", 180_000);
  if (result.exitCode !== 0) throw new Error("Child runtime bundle installation failed");
}
