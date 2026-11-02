export type ObolusEdition = "founder" | "personal" | "professional" | "business";
export type EconomicCapability = "research" | "experiments" | "products" | "paper_trading" | "live_trading";
export interface EditionPolicy {
  edition: ObolusEdition;
  commercialFeatures: EconomicCapability[];
  permissions: EconomicCapability[];
  emergencyStop: boolean;
}
const capabilities: EconomicCapability[] = ["research", "experiments", "products", "paper_trading", "live_trading"];

/** Product packaging cannot remove Founder capabilities or grant execution.
 * This gate supplements operation-specific risk/budget/connector admission. */
export function editionAdmission(policy: EditionPolicy, capability: EconomicCapability) {
  if (!policy || !["founder", "personal", "professional", "business"].includes(policy.edition) ||
      !capabilities.includes(capability) || typeof policy.emergencyStop !== "boolean" ||
      !Array.isArray(policy.permissions) || !Array.isArray(policy.commercialFeatures) ||
      [...policy.permissions, ...policy.commercialFeatures].some(value => !capabilities.includes(value))) {
    return { allowed: false, reason: "invalid_policy" };
  }
  if (policy.emergencyStop) return { allowed: false, reason: "emergency_stop" };
  if (!policy.permissions.includes(capability)) return { allowed: false, reason: "permission_missing" };
  if (policy.edition !== "founder" && !policy.commercialFeatures.includes(capability)) {
    return { allowed: false, reason: "edition_feature_disabled" };
  }
  return { allowed: true, reason: "operation_specific_admission_still_required" };
}
