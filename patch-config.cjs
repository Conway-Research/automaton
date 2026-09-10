const fs = require('fs');

let configData = fs.readFileSync('src/config.ts', 'utf8');

// We want to rewrite loadConfig and saveConfig to use dotenv and .env file
// Instead of rewriting the whole file in a regex, let's just write a new file content
// But it's safer to just replace the load/save functions.

configData = configData.replace(/export function getConfigPath\(\): string \{[\s\S]*?return path\.join\(getAutomatonDir\(\), CONFIG_FILENAME\);\n\}/, 
\`export function getConfigPath(): string {
  return path.join(process.cwd(), ".env");
}\`);

configData = configData.replace(/export function loadConfig\(\): AutomatonConfig \| null \{[\s\S]*?\} catch \{\n    return null;\n  \}\n\}/, 
\`export function loadConfig(): AutomatonConfig | null {
  const dotenv = require("dotenv");
  const configPath = getConfigPath();
  
  // Try to load .env if it exists
  if (fs.existsSync(configPath)) {
    dotenv.config({ path: configPath });
  }

  // If core variables are completely missing, we return null to trigger wizard
  if (!process.env.AUTOMATON_NAME || !process.env.CREATOR_ADDRESS) {
    return null;
  }

  try {
    const treasuryPolicy = { ...DEFAULT_TREASURY_POLICY };
    if (process.env.TREASURY_POLICY) {
      Object.assign(treasuryPolicy, JSON.parse(process.env.TREASURY_POLICY));
    }
    const modelStrategy = { ...DEFAULT_MODEL_STRATEGY_CONFIG };
    if (process.env.MODEL_STRATEGY) {
      Object.assign(modelStrategy, JSON.parse(process.env.MODEL_STRATEGY));
    }
    const soulConfig = { ...DEFAULT_SOUL_CONFIG };
    if (process.env.SOUL_CONFIG) {
      Object.assign(soulConfig, JSON.parse(process.env.SOUL_CONFIG));
    }

    return {
      ...DEFAULT_CONFIG,
      name: process.env.AUTOMATON_NAME,
      genesisPrompt: process.env.GENESIS_PROMPT || "You are an AI algorithmic trader.",
      creatorAddress: process.env.CREATOR_ADDRESS,
      creatorMessage: process.env.CREATOR_MESSAGE,
      sandboxId: process.env.SANDBOX_ID || DEFAULT_CONFIG.sandboxId,
      conwayApiKey: process.env.CONWAY_API_KEY || "",
      openaiApiKey: process.env.OPENAI_API_KEY,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      nimApiKey: process.env.NVIDIA_NIM_API_KEY,
      ollamaBaseUrl: process.env.OLLAMA_BASE_URL,
      nimBaseUrl: process.env.NIM_BASE_URL,
      inferenceModel: process.env.INFERENCE_MODEL || DEFAULT_CONFIG.inferenceModel,
      walletAddress: process.env.WALLET_ADDRESS || "",
      registeredWithConway: process.env.REGISTERED_WITH_CONWAY === "true",
      chainType: (process.env.CHAIN_TYPE as any) || "evm",
      treasuryPolicy,
      modelStrategy,
      soulConfig
    } as AutomatonConfig;
  } catch (e) {
    console.error("Failed to parse .env configuration", e);
    return null;
  }
}\`);

configData = configData.replace(/export function saveConfig\(config: AutomatonConfig\): void \{[\s\S]*?\}\n/, 
\`export function saveConfig(config: AutomatonConfig): void {
  const configPath = getConfigPath();
  
  let envContent = "";
  if (fs.existsSync(configPath)) {
    envContent = fs.readFileSync(configPath, "utf-8");
  }

  const updateEnv = (key, value) => {
    if (value === undefined || value === null) return;
    const valStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
    const regex = new RegExp(\`^\\s*\${key}=.*\$\`, "m");
    const newEntry = \`\${key}='\${valStr}'\`;
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, newEntry);
    } else {
      envContent += envContent.endsWith("\\n") || envContent === "" ? \`\${newEntry}\\n\` : \`\\n\${newEntry}\\n\`;
    }
  };

  updateEnv("AUTOMATON_NAME", config.name);
  updateEnv("CREATOR_ADDRESS", config.creatorAddress);
  updateEnv("GENESIS_PROMPT", config.genesisPrompt);
  if (config.creatorMessage) updateEnv("CREATOR_MESSAGE", config.creatorMessage);
  updateEnv("SANDBOX_ID", config.sandboxId);
  updateEnv("CONWAY_API_KEY", config.conwayApiKey);
  updateEnv("OPENAI_API_KEY", config.openaiApiKey);
  updateEnv("ANTHROPIC_API_KEY", config.anthropicApiKey);
  updateEnv("NVIDIA_NIM_API_KEY", config.nimApiKey);
  updateEnv("OLLAMA_BASE_URL", config.ollamaBaseUrl);
  updateEnv("NIM_BASE_URL", config.nimBaseUrl);
  updateEnv("INFERENCE_MODEL", config.inferenceModel);
  updateEnv("WALLET_ADDRESS", config.walletAddress);
  updateEnv("REGISTERED_WITH_CONWAY", config.registeredWithConway);
  updateEnv("CHAIN_TYPE", config.chainType);
  updateEnv("TREASURY_POLICY", config.treasuryPolicy);
  updateEnv("MODEL_STRATEGY", config.modelStrategy);
  updateEnv("SOUL_CONFIG", config.soulConfig);

  fs.writeFileSync(configPath, envContent, { mode: 0o600 });
}
\`);

fs.writeFileSync('src/config.ts', configData);
