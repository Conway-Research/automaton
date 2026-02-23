/**
 * 敏感信息拦截器
 * 严禁在任何输出中显示完整密钥
 */
export declare function sanitizeOutput(output: string): string;
export declare function containsSensitive(text: string): boolean;
export declare function logSanitized(message: string, ...args: any[]): void;
//# sourceMappingURL=sanitize.d.ts.map