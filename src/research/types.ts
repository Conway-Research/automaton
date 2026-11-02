/** Learning evidence is separate from financial receipts and never grants permissions. */
export interface EvidenceRecord {schemaVersion:1;id:string;createdAt:number;evidenceIds:string[];}
export type LearningPurpose='market-data'|'skill'|'efficiency'|'quality'|'creativity'|'relevance'|'profit'|'revenue'|'profitability'|'scalability'|'discovery';
export interface LearningGoal extends EvidenceRecord {title:string;version:number;}
export interface LearningContext {now:number;powerEnabled:boolean;controllerRunning:boolean;budgetActive:boolean;availableSlots:number;budgetRemainingRappen:number;dayRemainingRappen:number;rootRemainingRappen:number;limitsDigest:string;policyDigest:string;goalId:string;goalVersion:number;activationApproved:boolean;permissions:string[];}
export interface GapScores {goal:number;bottleneck:number;information:number;evidence:number;reuse:number;cost:number;duration:number;}
export interface LearningObservation {goalId:string;goalVersion:number;kind:LearningPurpose;evidenceIds:string[];capability:string;publicFocus?:string;title:string;application:string;successCriterion:string;scores:GapScores;observedAt:number;estimatedCostRappen:number;topicId?:string;failures?:number;lastAttemptAt?:number;previousEvidenceFingerprint?:string;}
export interface KnowledgeGap extends EvidenceRecord {topicId?:string;goalId:string;goalVersion:number;rootTaskId:string;kind:LearningPurpose;capability:string;publicFocus?:string;title:string;application:string;successCriterion:string;scores:GapScores;fingerprint:string;estimatedCostRappen:number;failures:number;lastAttemptAt:number|null;previousEvidenceFingerprint:string|null;}
export interface LearningDecision {gap:KnowledgeGap;score:number;eligible:boolean;reasons:string[];nextEligibleAt:number|null;}
export interface SourceCandidate extends EvidenceRecord {url:string;label:string;format:'text'|'csv'|'json';purpose:LearningPurpose;}
export interface SourceEvidence {url:string;digest:string;reviewedAt:number;reviewer:'registered-rule';license:'CC0-1.0'|'CC-BY-4.0'|'US-government'|'noncommercial'|'unknown';original:boolean;free:boolean;newAccountRequired:boolean;commercialUse:boolean;redistribution:boolean;attribution:string;ruleId:string;}
export interface SourceAssessment {status:'allowed'|'pending'|'restricted'|'blocked';reasons:string[];}
export interface SourceProbe extends EvidenceRecord {candidate:SourceCandidate;assessment:SourceAssessment;sha256:string|null;bytes:number;observations:number;status:'usable'|'unavailable'|'unsupported'|'rejected';permission?:SourceEvidence;}
export interface SourceProbeAdapters {evidence:(candidate:SourceCandidate,signal:AbortSignal)=>Promise<SourceEvidence>;read:(candidate:SourceCandidate,evidence:SourceEvidence,signal:AbortSignal)=>Promise<Uint8Array>;remainingBytes:number;clock:()=>number;}
export interface LearningCase {id:string;phase:'development'|'validation'|'replication';inputDigest:string;expectedOutputDigest:string;}
export interface ExperimentSpec extends EvidenceRecord {goalId:string;goalVersion:number;gapId:string;rootTaskId:string;purpose:LearningPurpose;policyDigest:string;limitsDigest:string;baselineDigest:string;candidateDigest:string;cases:LearningCase[];maxCostRappen:number;maxDurationMs:number;minimumImprovement:number;datasetKind?:string;costStatus:'known'|'model'|'unknown';contaminated:boolean;}
export interface ExperimentResult extends EvidenceRecord {experimentId:string;caseId:string;side:'baseline'|'candidate';phase:LearningCase['phase'];inputDigest:string;outputDigest:string;durationMs:number|null;costMinor:number|null;currency:string;criticalErrors:number;checksPassed:boolean;executionRef:string;revenueMinor:number|null;reworkCostMinor:number|null;}
export interface ExperimentAssessment {status:'unsupported'|'insufficient-evidence'|'rejected'|'verified';reasons:string[];resultIds:string[];}
export interface WorkloadEvidence {evidenceIds:string[];supportedExecutions:number;investmentMinor:number|null;currency:string;demandConfirmed:boolean;}
export interface ImprovementAssessment extends ExperimentAssessment {metric:'cost'|'time'|'quality'|'profit'|null;projectedNetBenefitMinor:number|null;profitProven:false;}
export interface CreativeCandidate {id:string;methodDigest:string;method:string;assumptions:string[];falsification:string;evidenceIds:string[];}
export interface CreativeSelection {selected:CreativeCandidate|null;reasons:string[];}
export interface SkillRecord extends EvidenceRecord {goalId:string;capability:string;experimentId:string;status:'proposed'|'practicing'|'verified'|'applicable'|'regressed';}
export interface RecipeRecord extends EvidenceRecord {goalId:string;goalVersion:number;capability:string;experimentId:string;version:number;supersedes:string|null;kind:'checklist'|'template'|'source-preference'|'deduplication';steps:string[];expiresAt:number;policyDigest:string;limitsDigest:string;resultIds:string[];}
export interface ApplicationReceipt extends EvidenceRecord {recipeId:string;taskId:string;resultIds:string[];executionRef:string;passed:boolean;costMinor:number|null;currency:string;durationMs:number|null;}
export interface PromotionEvidence {assessment:ImprovementAssessment;applications:ApplicationReceipt[];recipeRecorded:boolean;}
export interface PromotionDecision {status:'blocked'|'prepared'|'eligible';reasons:string[];}
export interface LearningTask {id:string;goalId:string;goalVersion:number;capability:string;}
export interface LearningEvent extends EvidenceRecord {kind:string;subjectId:string;detail:Record<string,unknown>;}
export interface LearningSnapshot {schemaVersion:1;observedAt:number;goals:LearningGoal[];gaps:KnowledgeGap[];sources:SourceProbe[];experiments:ExperimentSpec[];results:ExperimentResult[];skills:SkillRecord[];recipes:RecipeRecord[];applications:ApplicationReceipt[];events:LearningEvent[];truncated:boolean;}
