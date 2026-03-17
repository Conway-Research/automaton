# Exported functions from "src/config.ts"

<!--
```json configuration
{
  "testing-framework": "vitest",
  "no-mock-imports": true
}
```

```typescript before
import path from 'path';
import fs from 'fs';
```
-->

## getConfigPath()

These are the functional requirements for function `getConfigPath`.

| test name | getConfigPath                            |
| --------- | ---------------------------------------- |
|           | fromPosix('automatonDir/automaton.json') |

```typescript after
// This is a helper function for running the tests also on Windows
// If the tests runs only on Linux then it can be deleted and also all references to it must be removed
function fromPosix(p: string) {
  return p.replace(/\//g, path.sep);
}
```

```typescript mocks
vi.mock("../identity/wallet.js");
```

## loadConfig()

These are the functional requirements for function `loadConfig`.

| test name | loadConfig |
| --------- | ---------- |
|           | null       |

## loadConfigFrom(configPath: string)

It should be used only by loadConfig().

These are the functional requirements for function `loadConfigFrom`.

| test name                           | configPath    | loadConfigFrom                         |
| ----------------------------------- | ------------- | -------------------------------------- |
| loadConfigFrom from non-json file   | 'readme.md'   | null                                   |
| loadConfigFrom from empty json file | 'empty.json'  | expect.objectContaining(defaultConfig) |
| loadConfigFrom from valid json file | 'config.json' | expect.objectContaining(config)        |

```typescript before
vi.spyOn(fs, "readFileSync").mockImplementation((path: fs.PathOrFileDescriptor) => {
  switch (String(path)) {
    case "readme.md":
      return "# title";
    case "empty.json":
      return "{}";
    case "config.json":
      return JSON.stringify({
        conwayApiKey: "conwayApiKey",
        treasuryPolicy: "treasuryPolicy",
        modelStrategy: "modelStrategy",
        soulConfig: "soulConfig",
        sandboxId: "sandboxId",
      });
    default:
      throw new Error(`${path} not found`);
  }
});

const defaultConfig = {
  childSandboxMemoryMb: 1024,
  conwayApiKey: "mockApiKey",
  conwayApiUrl: "https://api.conway.tech",
  dbPath: "~/.automaton/state.db",
  heartbeatConfigPath: "~/.automaton/heartbeat.yml",
  inferenceModel: "gpt-5.2",
  logLevel: "info",
  maxChildren: 3,
  maxTokensPerTurn: 4096,
  maxTurnsPerCycle: 25,
  modelStrategy: expect.any(Object),
  sandboxId: undefined,
  skillsDir: "~/.automaton/skills",
  socialRelayUrl: "https://social.conway.tech",
  soulConfig: expect.any(Object),
  treasuryPolicy: expect.any(Object),
  version: "0.2.1",
};

const config = {
  childSandboxMemoryMb: 1024,
  conwayApiKey: "conwayApiKey",
  conwayApiUrl: "https://api.conway.tech",
  dbPath: "~/.automaton/state.db",
  heartbeatConfigPath: "~/.automaton/heartbeat.yml",
  inferenceModel: "gpt-5.2",
  logLevel: "info",
  maxChildren: 3,
  maxTokensPerTurn: 4096,
  maxTurnsPerCycle: 25,
  modelStrategy: expect.any(Object),
  sandboxId: "sandboxId",
  skillsDir: "~/.automaton/skills",
  socialRelayUrl: "https://social.conway.tech",
  soulConfig: expect.any(Object),
  treasuryPolicy: expect.any(Object),
  version: "0.2.1",
};
```

```typescript mocks
vi.mock("../identity/provision.js", async () => {
  const module = await vi.importActual("../identity/provision.js");
  return {
    ...module,
    loadApiKeyFromConfig: () => "mockApiKey",
  };
});
```

## saveConfig(config: AutomatonConfig)

These are the functional requirements for function `saveConfig`.

| test name   | config     | saveConfig |
| ----------- | ---------- | ---------- |
| save config | fullConfig | undefined  |

```typescript scenario(save config)
expect(fs.mkdirSync).toHaveBeenCalledWith("automatonDir", { recursive: true, mode: 0o700 });
expect(fs.writeFileSync).toHaveBeenCalledWith(fromPosix("automatonDir/automaton.json"), expect.anything(), {
  mode: 0o600,
});
const jsonString = (fs.writeFileSync as any).mock.calls[0][1];
expect(JSON.parse(jsonString)).toMatchObject(fullConfig);
```

```typescript before
vi.spyOn(fs, "mkdirSync").mockImplementation(() => undefined);
vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});

const fullConfig: AutomatonConfig = {
  childSandboxMemoryMb: 1024,
  conwayApiKey: "conwayApiKey",
  conwayApiUrl: "https://api.conway.tech",
  dbPath: "~/.automaton/state.db",
  heartbeatConfigPath: "~/.automaton/heartbeat.yml",
  inferenceModel: "gpt-5.2",
  logLevel: "info",
  maxChildren: 3,
  maxTokensPerTurn: 4096,
  maxTurnsPerCycle: 25,
  modelStrategy: {} as any,
  sandboxId: "sandboxId",
  skillsDir: "~/.automaton/skills",
  socialRelayUrl: "https://social.conway.tech",
  soulConfig: {} as any,
  treasuryPolicy: {} as any,
  version: "0.2.1",
  name: "name",
  genesisPrompt: "genesisPrompt",
  creatorAddress: "0123456789",
  registeredWithConway: true,
  walletAddress: "0123456789",
};
```

## resolvePath(p: string)

These are the functional requirements for function `resolvePath`.

| test name      | p       | {process.env.HOME} | resolvePath            |
| -------------- | ------- | ------------------ | ---------------------- |
| relative       | '~/abc' | undefined          | fromPosix('/root/abc') |
| absolute       | 'xyz'   | undefined          | 'xyz'                  |
| relative (env) | '~/abc' | '/opt'             | fromPosix('/opt/abc')  |
| absolute (env) | 'xyz'   | '/opt'             | 'xyz'                  |

## createConfig(params: { name: string; genesisPrompt: string; creatorMessage?: string; creatorAddress: Address; registeredWithConway: boolean; sandboxId: string; walletAddress: Address; apiKey: string; openaiApiKey?: string; anthropicApiKey?: string; ollamaBaseUrl?: string; parentAddress?: Address; treasuryPolicy?: TreasuryPolicy; })

These are the functional requirements for function `createConfig`.

| test name                    | params       | createConfig         |
| ---------------------------- | ------------ | -------------------- |
| create config from min input | minNewConfig | createdFromMinConfig |
| create config from max input | maxNewConfig | createdFromMaxConfig |

```typescript before
const minNewConfig = {
  name: "name",
  genesisPrompt: "genesisPrompt",
  creatorAddress: "0123456789",
  registeredWithConway: true,
  sandboxId: "sandboxId",
  walletAddress: "0123456789",
  apiKey: "apiKey",
};

const maxNewConfig = {
  name: "name",
  genesisPrompt: "genesisPrompt",
  creatorMessage: "creatorMessage",
  creatorAddress: "0123456789",
  registeredWithConway: true,
  sandboxId: "sandboxId",
  walletAddress: "0123456789",
  apiKey: "apiKey",
  openaiApiKey: "openaiApiKey",
  anthropicApiKey: "anthropicApiKey",
  ollamaBaseUrl: "ollamaBaseUrl",
  parentAddress: "0123456789",
  treasuryPolicy: {} as any,
  chainType: "solana" as const,
};

const createdFromMinConfig: AutomatonConfig = {
  anthropicApiKey: undefined,
  chainType: "evm",
  conwayApiKey: "apiKey",
  conwayApiUrl: "https://api.conway.tech",
  creatorAddress: "0123456789",
  creatorMessage: undefined,
  dbPath: "~/.automaton/state.db",
  genesisPrompt: "genesisPrompt",
  heartbeatConfigPath: "~/.automaton/heartbeat.yml",
  inferenceModel: "gpt-5.2",
  logLevel: "info",
  maxChildren: 3,
  maxTokensPerTurn: 4096,
  name: "name",
  ollamaBaseUrl: undefined,
  openaiApiKey: undefined,
  parentAddress: undefined,
  registeredWithConway: true,
  sandboxId: "sandboxId",
  skillsDir: "~/.automaton/skills",
  treasuryPolicy: {
    maxDailyTransferCents: 25000,
    maxHourlyTransferCents: 10000,
    maxInferenceDailyCents: 50000,
    maxSingleTransferCents: 5000,
    maxTransfersPerTurn: 2,
    maxX402PaymentCents: 100,
    minimumReserveCents: 1000,
    requireConfirmationAboveCents: 1000,
    transferCooldownMs: 0,
    x402AllowedDomains: ["conway.tech"],
  },
  version: "0.2.1",
  walletAddress: "0123456789",
};

const createdFromMaxConfig: AutomatonConfig = {
  anthropicApiKey: "anthropicApiKey",
  chainType: "solana",
  conwayApiKey: "apiKey",
  conwayApiUrl: "https://api.conway.tech",
  creatorAddress: "0123456789",
  creatorMessage: "creatorMessage",
  dbPath: "~/.automaton/state.db",
  genesisPrompt: "genesisPrompt",
  heartbeatConfigPath: "~/.automaton/heartbeat.yml",
  inferenceModel: "gpt-5.2",
  logLevel: "info",
  maxChildren: 3,
  maxTokensPerTurn: 4096,
  name: "name",
  ollamaBaseUrl: "ollamaBaseUrl",
  openaiApiKey: "openaiApiKey",
  parentAddress: "0123456789",
  registeredWithConway: true,
  sandboxId: "sandboxId",
  skillsDir: "~/.automaton/skills",
  treasuryPolicy: {} as any,
  version: "0.2.1",
  walletAddress: "0123456789",
};
```
