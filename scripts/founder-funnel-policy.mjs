/** Patrice's values of 2.11.2026 for customer acquisition. Set without a data basis;
 * to be reviewed against real runs. They grant no contact rights and no budget.
 * Routine work is only the accepted document project A/B, nothing broader. */
const DAY=86400000;
export const FUNNEL_POLICY=Object.freeze({maxFollowUps:2,minWaitMs:7*DAY,minSample:20,routineWork:Object.freeze(['qualified-document-project-ab'])});
