export declare function promptRequired(label: string): Promise<string>;
export declare function promptOptional(label: string): Promise<string>;
export declare function promptMultiline(label: string): Promise<string>;
export declare function promptAddress(label: string): Promise<string>;
/**
 * Prompt for a numeric value with a default.
 * Shows the label with default, validates input is a positive integer,
 * returns the default on empty or invalid input.
 */
export declare function promptWithDefault(label: string, defaultValue: number): Promise<number>;
export declare function closePrompts(): void;
//# sourceMappingURL=prompts.d.ts.map