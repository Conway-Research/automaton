/**
 * Soul Validator — Content validation and injection detection for soul content.
 *
 * Validates soul sections against size limits, structural requirements,
 * and injection patterns. Never throws — returns ValidationResult objects.
 *
 * Phase 2.1: Soul System Redesign
 */
import type { SoulModel, SoulValidationResult } from "../types.js";
/**
 * Check if text contains injection patterns.
 */
export declare function containsInjectionPatterns(text: string): boolean;
/**
 * Validate a SoulModel against size limits, structural requirements, and injection patterns.
 * Never throws — returns a ValidationResult.
 */
export declare function validateSoul(soul: SoulModel): SoulValidationResult;
/**
 * Strip injection patterns and enforce size limits on a soul model.
 * Returns a cleaned copy.
 */
export declare function sanitizeSoul(soul: SoulModel): SoulModel;
//# sourceMappingURL=validator.d.ts.map