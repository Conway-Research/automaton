/**
 * Regression test for a real production bug: in local/BYOK mode (no Conway
 * sandbox), writeFile()/readFile() resolve relative paths against
 * process.cwd(), but exec() used to hardcode $HOME as its cwd instead. An
 * agent writing a file with write_file and then checking for it with
 * exec("find ...") would get a false "No such file or directory" — which is
 * exactly what happened live, causing the agent to loop re-checking its own
 * status instead of trusting work it had already done.
 */
import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { createConwayClient } from "../conway/client.js";

describe("local-mode exec/writeFile path consistency", () => {
  const relDir = "test-tmp-path-consistency";
  const relFile = `${relDir}/probe.txt`;

  afterEach(() => {
    fs.rmSync(path.join(process.cwd(), relDir), { recursive: true, force: true });
  });

  it("exec sees files written by writeFile at the same relative path", async () => {
    const conway = createConwayClient({
      apiUrl: "https://api.conway.tech",
      apiKey: "test-key",
      sandboxId: "", // local mode
    });

    await conway.writeFile(relFile, "hello from writeFile");

    const result = await conway.exec(`cat ${relFile}`);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("hello from writeFile");
  });

  it("exec's cwd matches process.cwd(), not $HOME", async () => {
    const conway = createConwayClient({
      apiUrl: "https://api.conway.tech",
      apiKey: "test-key",
      sandboxId: "",
    });

    const result = await conway.exec("pwd");

    expect(result.stdout.trim()).toBe(process.cwd());
  });
});
