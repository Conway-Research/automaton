/**
 * Config Tests
 *
 * Tests for config loading, saving, merging with defaults,
 * and validation of treasury policy values.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { createConfig, resolvePath } from "../config.js";
import { DEFAULT_TREASURY_POLICY } from "../types.js";

describe("createConfig", () => {
  it("creates config with required fields", () => {
    const config = createConfig({
      name: "test-bot",
      genesisPrompt: "Be helpful.",
      creatorAddress: "0xabc",
      registeredWithConway: true,
      sandboxId: "sbx-123",
      walletAddress: "0x123",
      apiKey: "key-123",
    });

    expect(config.name).toBe("test-bot");
    expect(config.genesisPrompt).toBe("Be helpful.");
    expect(config.creatorAddress).toBe("0xabc");
    expect(config.sandboxId).toBe("sbx-123");
    expect(config.conwayApiKey).toBe("key-123");
  });

  it("applies default treasury policy when none provided", () => {
    const config = createConfig({
      name: "test",
      genesisPrompt: "test",
      creatorAddress: "0xabc",
      registeredWithConway: true,
      sandboxId: "sbx-1",
      walletAddress: "0x1",
      apiKey: "key-1",
    });

    expect(config.treasuryPolicy).toEqual(DEFAULT_TREASURY_POLICY);
  });

  it("uses provided treasury policy over defaults", () => {
    const customPolicy = {
      ...DEFAULT_TREASURY_POLICY,
      maxSingleTransferCents: 999,
    };

    const config = createConfig({
      name: "test",
      genesisPrompt: "test",
      creatorAddress: "0xabc",
      registeredWithConway: true,
      sandboxId: "sbx-1",
      walletAddress: "0x1",
      apiKey: "key-1",
      treasuryPolicy: customPolicy,
    });

    expect(config.treasuryPolicy!.maxSingleTransferCents).toBe(999);
  });

  it("trims whitespace from sandboxId", () => {
    const config = createConfig({
      name: "test",
      genesisPrompt: "test",
      creatorAddress: "0xabc",
      registeredWithConway: true,
      sandboxId: "  sbx-1  ",
      walletAddress: "0x1",
      apiKey: "key-1",
    });

    expect(config.sandboxId).toBe("sbx-1");
  });

  it("handles empty sandboxId", () => {
    const config = createConfig({
      name: "test",
      genesisPrompt: "test",
      creatorAddress: "0xabc",
      registeredWithConway: true,
      sandboxId: "",
      walletAddress: "0x1",
      apiKey: "key-1",
    });

    expect(config.sandboxId).toBe("");
  });

  it("defaults chainType to evm", () => {
    const config = createConfig({
      name: "test",
      genesisPrompt: "test",
      creatorAddress: "0xabc",
      registeredWithConway: true,
      sandboxId: "sbx-1",
      walletAddress: "0x1",
      apiKey: "key-1",
    });

    expect(config.chainType).toBe("evm");
  });

  it("accepts solana chainType", () => {
    const config = createConfig({
      name: "test",
      genesisPrompt: "test",
      creatorAddress: "0xabc",
      registeredWithConway: true,
      sandboxId: "sbx-1",
      walletAddress: "0x1",
      apiKey: "key-1",
      chainType: "solana",
    });

    expect(config.chainType).toBe("solana");
  });

  it("includes optional API keys when provided", () => {
    const config = createConfig({
      name: "test",
      genesisPrompt: "test",
      creatorAddress: "0xabc",
      registeredWithConway: true,
      sandboxId: "sbx-1",
      walletAddress: "0x1",
      apiKey: "key-1",
      openaiApiKey: "sk-openai",
      anthropicApiKey: "sk-anthropic",
    });

    expect(config.openaiApiKey).toBe("sk-openai");
    expect(config.anthropicApiKey).toBe("sk-anthropic");
  });

  it("sets parentAddress when provided", () => {
    const config = createConfig({
      name: "child-bot",
      genesisPrompt: "test",
      creatorAddress: "0xabc",
      registeredWithConway: true,
      sandboxId: "sbx-1",
      walletAddress: "0x1",
      apiKey: "key-1",
      parentAddress: "0xparent",
    });

    expect(config.parentAddress).toBe("0xparent");
  });
});

describe("resolvePath", () => {
  it("expands ~ to home directory", () => {
    const home = process.env.HOME || "/root";
    expect(resolvePath("~/.automaton/config.json")).toBe(
      path.join(home, ".automaton/config.json"),
    );
  });

  it("returns absolute paths unchanged", () => {
    expect(resolvePath("/usr/local/bin")).toBe("/usr/local/bin");
  });

  it("returns relative paths unchanged", () => {
    expect(resolvePath("relative/path")).toBe("relative/path");
  });
});
