/**
 * 敏感信息拦截器
 * 严禁在任何输出中显示完整密钥
 */

const SENSITIVE_PATTERNS = [
  /cnwy_k_[A-Za-z0-9]+/g,           // Conway API Key
  /sk-[A-Za-z0-9]+/g,               // OpenAI API Key
  /[0-9a-f]{32,}\.[A-Za-z0-9_-]+/g, // JWT Token
  /0x[0-9a-fA-F]{64}/g,             // Private Key
];

export function sanitizeOutput(output: string): string {
  let sanitized = output;
  
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }
  
  return sanitized;
}

export function containsSensitive(text: string): boolean {
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}

export function logSanitized(message: string, ...args: any[]): void {
  const sanitizedMessage = sanitizeOutput(message);
  const sanitizedArgs = args.map(arg => 
    typeof arg === 'string' ? sanitizeOutput(arg) : arg
  );
  console.log(sanitizedMessage, ...sanitizedArgs);
}
