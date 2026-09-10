const fs = require('fs');

let index = fs.readFileSync('src/index.ts', 'utf8');

const replacement = `
  let config = loadConfig();
  if (!config) {
    if (process.env.RAILWAY_PROJECT_ID || process.env.CI) {
      console.log("Headless environment detected. Bypassing interactive wizard...");
      const { createConfig, saveConfig } = await import("./config.js");
      config = createConfig({
         name: "AlgoTrader",
         genesisPrompt: "You are an AI algorithmic trader.",
         apiKey: "",
         chainType: "evm",
         walletAddress: ""
      });
      saveConfig(config);
    } else {
      const { runSetupWizard } = await import("./setup/wizard.js");
      config = await runSetupWizard();
    }
  }
`;

index = index.replace(/let config = loadConfig\(\);\n\s*if \(\!config\) \{\n\s*const \{ runSetupWizard \} = await import\("\.\/setup\/wizard\.js"\);\n\s*config = await runSetupWizard\(\);\n\s*\}/, replacement);

fs.writeFileSync('src/index.ts', index);
