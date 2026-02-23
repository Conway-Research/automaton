/**
 * Input Validation Policy Rules
 *
 * Validates tool arguments before execution. Catches malformed
 * input before it reaches any shell command or API call.
 */
const PACKAGE_NAME_RE = /^[@a-zA-Z0-9._/-]+$/;
const SKILL_NAME_RE = /^[a-zA-Z0-9-]+$/;
const GIT_HASH_RE = /^[a-f0-9]{7,40}$/;
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const CRON_PARTS_RE = /^(\*|[\d,*/-]+)\s+(\*|[\d,*/-]+)\s+(\*|[\d,*/-]+)\s+(\*|[\d,*/-]+)\s+(\*|[\d,*/-]+)$/;
function deny(rule, reasonCode, humanMessage) {
    return { rule, action: "deny", reasonCode, humanMessage };
}
/**
 * Validate npm package name format.
 */
function createPackageNameRule() {
    return {
        id: "validate.package_name",
        description: "Validate npm package name format",
        priority: 100,
        appliesTo: {
            by: "name",
            names: ["install_npm_package", "install_mcp_server"],
        },
        evaluate(request) {
            const pkg = request.args.package;
            if (pkg === undefined)
                return null;
            if (!PACKAGE_NAME_RE.test(pkg)) {
                return deny("validate.package_name", "VALIDATION_FAILED", `Invalid package name: "${pkg}". Must match ${PACKAGE_NAME_RE.source}`);
            }
            return null;
        },
    };
}
/**
 * Validate skill name format.
 */
function createSkillNameRule() {
    return {
        id: "validate.skill_name",
        description: "Validate skill name format (alphanumeric + hyphens only)",
        priority: 100,
        appliesTo: {
            by: "name",
            names: ["install_skill", "create_skill", "remove_skill"],
        },
        evaluate(request) {
            const name = request.args.name;
            if (name === undefined)
                return null;
            if (!SKILL_NAME_RE.test(name)) {
                return deny("validate.skill_name", "VALIDATION_FAILED", `Invalid skill name: "${name}". Must match ${SKILL_NAME_RE.source}`);
            }
            return null;
        },
    };
}
/**
 * Validate git commit hash format.
 */
function createGitHashRule() {
    return {
        id: "validate.git_hash",
        description: "Validate git commit hash format",
        priority: 100,
        appliesTo: {
            by: "name",
            names: ["pull_upstream"],
        },
        evaluate(request) {
            const commit = request.args.commit;
            if (commit === undefined)
                return null; // commit is optional
            if (!GIT_HASH_RE.test(commit)) {
                return deny("validate.git_hash", "VALIDATION_FAILED", `Invalid git hash: "${commit}". Must be 7-40 lowercase hex characters.`);
            }
            return null;
        },
    };
}
/**
 * Validate port number range.
 */
function createPortRangeRule() {
    return {
        id: "validate.port_range",
        description: "Validate port number is in valid range (1-65535)",
        priority: 100,
        appliesTo: {
            by: "name",
            names: ["expose_port", "remove_port"],
        },
        evaluate(request) {
            const port = request.args.port;
            if (port === undefined)
                return null;
            if (!Number.isInteger(port) || port < 1 || port > 65535) {
                return deny("validate.port_range", "VALIDATION_FAILED", `Invalid port: ${port}. Must be integer 1-65535.`);
            }
            return null;
        },
    };
}
/**
 * Validate cron expression structure.
 */
function createCronExpressionRule() {
    return {
        id: "validate.cron_expression",
        description: "Validate cron expression format",
        priority: 100,
        appliesTo: {
            by: "name",
            names: ["modify_heartbeat"],
        },
        evaluate(request) {
            const schedule = request.args.schedule;
            if (schedule === undefined)
                return null;
            if (!CRON_PARTS_RE.test(schedule.trim())) {
                return deny("validate.cron_expression", "VALIDATION_FAILED", `Invalid cron expression: "${schedule}". Must be 5 space-separated fields.`);
            }
            return null;
        },
    };
}
/**
 * Validate Ethereum address format.
 */
function createAddressFormatRule() {
    return {
        id: "validate.address_format",
        description: "Validate Ethereum address format (0x + 40 hex chars)",
        priority: 100,
        appliesTo: {
            by: "name",
            names: ["transfer_credits", "send_message", "fund_child"],
        },
        evaluate(request) {
            const address = request.args.to_address
                ?? request.args.agent_address;
            if (address === undefined)
                return null;
            if (!ADDRESS_RE.test(address)) {
                return deny("validate.address_format", "VALIDATION_FAILED", `Invalid address format: "${address}". Must be 0x followed by 40 hex characters.`);
            }
            return null;
        },
    };
}
export function createValidationRules() {
    return [
        createPackageNameRule(),
        createSkillNameRule(),
        createGitHashRule(),
        createPortRangeRule(),
        createCronExpressionRule(),
        createAddressFormatRule(),
    ];
}
//# sourceMappingURL=validation.js.map