declare const process: {
  argv: string[];
  exit(code?: number): never;
  env: Record<string, string | undefined>;
  on(event: string, listener: (...args: unknown[]) => void): void;
};
