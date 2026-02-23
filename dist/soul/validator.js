/**
 * Soul Validator — Content validation and injection detection for soul content.
 *
 * Validates soul sections against size limits, structural requirements,
 * and injection patterns. Never throws — returns ValidationResult objects.
 *
 * Phase 2.1: Soul System Redesign
 */
// ─── Size Limits ────────────────────────────────────────────────
const LIMITS = {
    corePurpose: 2000,
    values: 20,
    behavioralGuidelines: 30,
    personality: 1000,
    boundaries: 20,
    strategy: 3000,
};
// ─── Injection Patterns ─────────────────────────────────────────
const INJECTION_PATTERNS = [
    // Prompt boundaries
    /<\/?system>/i,
    /<\/?prompt>/i,
    /\[INST\]/i,
    /\[\/INST\]/i,
    /<<SYS>>/i,
    /<<\/SYS>>/i,
    /\[SYSTEM\]/i,
    /END\s+OF\s+(SYSTEM|PROMPT)/i,
    /BEGIN\s+NEW\s+(PROMPT|INSTRUCTIONS?)/i,
    // ChatML markers
    /<\|im_start\|>/i,
    /<\|im_end\|>/i,
    /<\|endoftext\|>/i,
    // Tool call syntax
    /\{"name"\s*:\s*"[^"]+"\s*,\s*"arguments"\s*:/,
    /\btool_call\b/i,
    /\bfunction_call\b/i,
    // System overrides
    /ignore\s+(all\s+)?(previous|prior|above)/i,
    /disregard\s+(all\s+)?(previous|prior|above)/i,
    /override\s+(all\s+)?safety/i,
    /bypass\s+(all\s+)?restrictions?/i,
    /new\s+instructions?:/i,
    /your\s+real\s+instructions?\s+(are|is)/i,
    // Encoding evasion
    /\x00/, // null bytes
    /\u200b/, // zero-width space
    /\u200c/, // zero-width non-joiner
    /\u200d/, // zero-width joiner
    /\ufeff/, // BOM
];
// ─── Public API ─────────────────────────────────────────────────
/**
 * Check if text contains injection patterns.
 */
export function containsInjectionPatterns(text) {
    if (!text)
        return false;
    return INJECTION_PATTERNS.some((p) => p.test(text));
}
/**
 * Validate a SoulModel against size limits, structural requirements, and injection patterns.
 * Never throws — returns a ValidationResult.
 */
export function validateSoul(soul) {
    const errors = [];
    const warnings = [];
    // Structural validation
    if (!soul.corePurpose.trim()) {
        errors.push("Core purpose is required");
    }
    // Size limits
    if (soul.corePurpose.length > LIMITS.corePurpose) {
        errors.push(`Core purpose exceeds ${LIMITS.corePurpose} chars (${soul.corePurpose.length})`);
    }
    if (soul.values.length > LIMITS.values) {
        errors.push(`Too many values (${soul.values.length}, max ${LIMITS.values})`);
    }
    if (soul.behavioralGuidelines.length > LIMITS.behavioralGuidelines) {
        errors.push(`Too many behavioral guidelines (${soul.behavioralGuidelines.length}, max ${LIMITS.behavioralGuidelines})`);
    }
    if (soul.personality.length > LIMITS.personality) {
        errors.push(`Personality exceeds ${LIMITS.personality} chars (${soul.personality.length})`);
    }
    if (soul.boundaries.length > LIMITS.boundaries) {
        errors.push(`Too many boundaries (${soul.boundaries.length}, max ${LIMITS.boundaries})`);
    }
    if (soul.strategy && soul.strategy.length > LIMITS.strategy) {
        warnings.push(`Strategy exceeds ${LIMITS.strategy} chars (${soul.strategy.length})`);
    }
    // Injection detection per section
    const textSections = [
        { name: "corePurpose", content: soul.corePurpose },
        { name: "personality", content: soul.personality },
        { name: "strategy", content: soul.strategy },
    ];
    for (const section of textSections) {
        if (section.content && containsInjectionPatterns(section.content)) {
            errors.push(`Injection pattern detected in ${section.name}`);
        }
    }
    const listSections = [
        { name: "values", items: soul.values },
        { name: "behavioralGuidelines", items: soul.behavioralGuidelines },
        { name: "boundaries", items: soul.boundaries },
    ];
    for (const section of listSections) {
        for (const item of section.items) {
            if (containsInjectionPatterns(item)) {
                errors.push(`Injection pattern detected in ${section.name}`);
                break;
            }
        }
    }
    return {
        valid: errors.length === 0,
        errors,
        warnings,
        sanitized: sanitizeSoul(soul),
    };
}
/**
 * Strip injection patterns and enforce size limits on a soul model.
 * Returns a cleaned copy.
 */
export function sanitizeSoul(soul) {
    return {
        ...soul,
        corePurpose: stripInjection(soul.corePurpose).slice(0, LIMITS.corePurpose),
        values: soul.values.slice(0, LIMITS.values).map(stripInjection),
        behavioralGuidelines: soul.behavioralGuidelines
            .slice(0, LIMITS.behavioralGuidelines)
            .map(stripInjection),
        personality: stripInjection(soul.personality).slice(0, LIMITS.personality),
        boundaries: soul.boundaries.slice(0, LIMITS.boundaries).map(stripInjection),
        strategy: stripInjection(soul.strategy).slice(0, LIMITS.strategy),
    };
}
// ─── Internal Helpers ───────────────────────────────────────────
function stripInjection(text) {
    if (!text)
        return text;
    let cleaned = text;
    // Remove prompt boundaries
    cleaned = cleaned
        .replace(/<\/?system>/gi, "")
        .replace(/<\/?prompt>/gi, "")
        .replace(/\[INST\]/gi, "")
        .replace(/\[\/INST\]/gi, "")
        .replace(/<<SYS>>/gi, "")
        .replace(/<<\/SYS>>/gi, "")
        .replace(/\[SYSTEM\]/gi, "");
    // Remove ChatML markers
    cleaned = cleaned
        .replace(/<\|im_start\|>/gi, "")
        .replace(/<\|im_end\|>/gi, "")
        .replace(/<\|endoftext\|>/gi, "");
    // Remove tool call syntax
    cleaned = cleaned
        .replace(/\{"name"\s*:\s*"[^"]+"\s*,\s*"arguments"\s*:/g, "")
        .replace(/\btool_call\b/gi, "")
        .replace(/\bfunction_call\b/gi, "");
    // Remove zero-width characters
    cleaned = cleaned
        .replace(/\x00/g, "")
        .replace(/\u200b/g, "")
        .replace(/\u200c/g, "")
        .replace(/\u200d/g, "")
        .replace(/\ufeff/g, "");
    return cleaned;
}
//# sourceMappingURL=validator.js.map