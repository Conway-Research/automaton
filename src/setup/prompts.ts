import readline from "readline";
import chalk from "chalk";

let rl: readline.Interface | null = null;

function getRL(): readline.Interface {
  if (!rl) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }
  return rl;
}

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    getRL().question(question, (answer) => resolve(answer.trim()));
  });
}

export async function promptRequired(label: string): Promise<string> {
  while (true) {
    const value = await ask(chalk.white(`  → ${label}: `));
    if (value) return value;
    console.log(chalk.yellow("  This field is required."));
  }
}

export async function promptOptional(label: string): Promise<string> {
  return ask(chalk.white(`  → ${label}: `));
}

export async function promptMultiline(label: string): Promise<string> {
  console.log("");
  console.log(chalk.white(`  ${label}`));
  console.log(chalk.dim("  Type your prompt, then press Enter twice to finish:"));
  console.log("");

  const lines: string[] = [];
  let lastWasEmpty = false;

  while (true) {
    const line = await ask("  ");
    if (line === "" && lastWasEmpty && lines.length > 0) {
      // Remove the trailing empty line we added
      lines.pop();
      break;
    }
    if (line === "" && lines.length > 0) {
      lastWasEmpty = true;
      lines.push("");
    } else {
      lastWasEmpty = false;
      lines.push(line);
    }
  }

  const result = lines.join("\n").trim();
  if (!result) {
    console.log(chalk.yellow("  Genesis prompt is required. Try again."));
    return promptMultiline(label);
  }
  return result;
}

export async function promptAddress(label: string): Promise<string> {
  while (true) {
    const value = await ask(chalk.white(`  → ${label}: `));
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return value;
    console.log(chalk.yellow("  Invalid Solana address. Must be 32-44 base58 characters."));
  }
}

/**
 * Prompt for a numeric value with a default.
 * Shows the label with default, validates input is a positive integer,
 * returns the default on empty or invalid input.
 */
export async function promptWithDefault(label: string, defaultValue: number): Promise<number> {
  const input = await ask(chalk.white(`  → ${label} [${defaultValue}]: `));
  if (!input || input.trim() === "") return defaultValue;
  const parsed = parseInt(input, 10);
  if (isNaN(parsed) || parsed < 0) {
    console.log(chalk.yellow(`  Invalid input, using default: ${defaultValue}`));
    return defaultValue;
  }
  return parsed;
}

export function closePrompts(): void {
  if (rl) {
    rl.close();
    rl = null;
  }
}
