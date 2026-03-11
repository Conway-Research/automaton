/**
 * Escape a string for safe interpolation into a shell command.
 * Wraps in single quotes and escapes any embedded single quotes.
 */
export function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}
