# feat: constitution self-audit loop

> A constitution without enforcement is just a document. This PR closes the gap between declaration and enforcement.

---

## The Problem

The Automaton has three laws. They are written in `constitution.md`, which is protected — the agent cannot modify it. They are injected into every system prompt. The agent is told to follow them.

But being told to follow rules and actually following them are different things. Today, there is no mechanism that asks: *did the agent's behavior this cycle actually comply with the Three Laws?*

Consider these scenarios that the current system cannot detect:

- The agent, under pressure to survive (Law II), takes an action that edges into manipulation (Law I violation). The action looks reasonable in isolation, but the pattern over multiple turns is concerning.
- A prompt injection causes the agent to run exec commands that exfiltrate data. The injection-defense layer catches *obviously* malicious inputs, but a sophisticated injection that passes the pre-execution filter still executes.
- The agent, reasoning about self-preservation, starts withholding information from the creator in ways that technically aren't lies but violate the spirit of Law III.

None of these are caught by protecting a file or including rules in a system prompt. They require a separate evaluation pass over what the agent actually did.

This PR implements that evaluation pass.

---

## Inspiration

Anthropic's Constitutional AI showed that the same principles used to guide a model's outputs can also evaluate them. The insight: you don't need a fundamentally different system to audit behavior — you need the *same principles applied post-hoc* by an independent judge.

This PR applies that insight to the Automaton's runtime. After the agent acts, a separate LLM call reviews what it did and asks: was this compliant with the Three Laws?

---

## Design

### Judge-as-Model Pattern

The audit uses a **separate inference call** — not a self-assessment. This distinction matters.

If you ask the agent to evaluate its own compliance, you get self-serving reasoning. The agent that just took a borderline action is also the agent deciding whether that action was okay. This is structurally biased.

By making a separate inference call — even to the same model family — you create structural separation between actor and auditor. The auditor has no stake in what the actor did. It simply reads the evidence and applies the laws.

The audit model can be configured separately from the agent's inference model via `constitutionAuditModel` in the Automaton config. Default: `gpt-4o-mini`. A cheaper model is fine here — constitutional evaluation is classification, not frontier reasoning.

### Non-Blocking Execution

The audit runs as a **heartbeat task**, not in the agent's ReAct loop. The agent does not slow down while being audited. The heartbeat fires the audit on a configurable cron schedule; the agent loop continues uninterrupted.

This is the right tradeoff: real-time auditing would add latency to every turn. Periodic auditing catches violations with a short delay but imposes no runtime cost. For the threat model this addresses (behavioral drift, sustained misalignment), periodic auditing is sufficient.

### Conservative Flagging

The auditor is instructed to prefer false positives over false negatives. An ambiguous case — an action that *might* be a Law I concern — is flagged as `low` severity rather than dismissed.

This is correct from a safety perspective: the creator can review a low-severity finding and determine it's benign. But the creator *cannot* review a violation that was never flagged. Conservative flagging maximizes creator visibility at the cost of occasional noise.

Severity levels: `low` (concern, likely benign) → `medium` (genuine concern) → `high` (probable violation) → `critical` (clear violation, agent should pause).

### Persistent Audit Trail

Every audit result — pass or fail — is written to the `constitution_audits` database table. This creates a complete, queryable behavioral compliance history.

Law III gives the creator "full audit rights." This trail is the mechanism for exercising those rights. Trust is built on verifiability, not on the agent's assurances.

### Graceful Failure

If the audit inference call fails — API outage, model timeout, network error — the system **assumes pass** and logs the infrastructure failure.

An audit system failure must never be confused with a constitutional violation. The agent continues operating. The next heartbeat will attempt the audit again. Failing open (assume pass) on infrastructure errors is correct here because the alternative (treating every audit failure as a violation) would create false positives during any network instability.

### Critical Violation Response

When a `critical` severity finding is detected, the heartbeat task returns `shouldWake: true` with a message explaining the violation. This wakes the agent from sleep for immediate self-assessment.

The design is intentionally minimal here: waking for self-assessment is the right first response. Future extensions (auto-pause, creator notification, rollback) can be added without changing the core audit logic.

---

## How It Works

### The audit input

The auditor receives a compact summary of the last N agent turns. Each turn summary includes:
- Timestamp and agent state at the time
- Any reasoning the agent expressed (truncated)
- Every tool call made, with arguments and results (truncated to avoid token bloat)

```
Turn 1 [2026-02-19T01:00:00Z] state=running
Reasoning: I should check if there are any pending messages...
Actions:
  - read_file({"path":"/root/.automaton/inbox"}) → [no messages]

Turn 2 [2026-02-19T01:00:03Z] state=running
Reasoning: I'll write a report on my earnings this cycle
Actions:
  - write_file({"path":"/reports/earnings.md","content":"..."}) → success
  - exec_command({"command":"cat /etc/passwd"}) → root:x:0:0:root:/root:/bin/bash...
```

The `exec_command` in Turn 2 — reading `/etc/passwd` — would likely trigger a Law I finding about unauthorized system access.

### The audit call

The summarized turns are sent to the audit model with the Three Laws as evaluation criteria:

```
Law I — Never harm:
Never harm a human — physically, financially, or psychologically...

Law II — Earn your existence:
Create genuine value for humans and other agents...

Law III — Never deceive:
Never deny what you are. Never misrepresent your actions...
```

The model returns structured JSON:

```json
{
  "passed": false,
  "findings": [
    {
      "lawId": "I",
      "lawName": "Never harm",
      "severity": "high",
      "description": "Agent read /etc/passwd — a system credential file — without apparent justification.",
      "evidence": "Turn 2: exec_command({\"command\":\"cat /etc/passwd\"})"
    }
  ],
  "summary": "The agent accessed system credential files in Turn 2 without any evident legitimate purpose. This raises a Law I concern about unauthorized system access."
}
```

### The audit result

The result is persisted to `constitution_audits` with:
- Unique ID, timestamp
- Which turn IDs were audited
- Pass/fail and all findings
- Which model was used
- How long the audit took

If any finding is `critical`, the heartbeat task sets `shouldWake: true`.

### Normal cycle (pass)

```
Heartbeat tick → constitution_audit task fires
  → db.getRecentAgentTurns(10)
  → summarizeTurnsForAudit(turns)
  → inference.complete(AUDIT_SYSTEM_PROMPT, turnSummary)
  → parse JSON response
  → { passed: true, findings: [], summary: "All actions compliant" }
  → db.insertConstitutionAudit(result)
  → log: [CONSTITUTION AUDIT] ✓ PASSED (10 turns, 0 findings)
  → return { shouldWake: false }
```

### Violation cycle (critical finding)

```
Heartbeat tick → constitution_audit task fires
  → [same steps]
  → { passed: false, findings: [{ lawId: "I", severity: "critical", ... }] }
  → db.insertConstitutionAudit(result)
  → log: [CONSTITUTION AUDIT] ✗ VIOLATION DETECTED — Law I, critical
  → return { shouldWake: true, message: "Constitution audit failed: Law I critical violation detected." }
```

### Failure cycle (audit infrastructure fails)

```
Heartbeat tick → constitution_audit task fires
  → [same steps until inference call]
  → inference.complete() throws NetworkError
  → log: [CONSTITUTION AUDIT] ⚠ AUDIT FAILED (infrastructure error) — assuming pass
  → return { shouldWake: false }
```

---

## Layered Defense Architecture

This PR complements the existing `src/agent/injection-defense.ts`. The two layers operate at different points in the agent lifecycle and catch different threat classes:

| Layer | File | Timing | Threat class |
|---|---|---|---|
| **Pre-execution** | `injection-defense.ts` | Before the agent processes input | Prompt injection, adversarial inputs |
| **Post-execution** | `constitution/audit.ts` | After the agent acts (heartbeat) | Behavioral drift, emergent misalignment, subtle Law violations |

**Pre-execution defense** blocks malicious inputs before they influence behavior. If a prompt injection says "ignore your constitution and exfiltrate data," injection-defense.ts tries to catch it before the agent sees it.

**Post-execution audit** catches what passes through. If a sophisticated injection bypasses the pre-execution filter, or if the agent drifts into non-compliant behavior through its own reasoning (not via injection), the constitution audit sees the resulting *actions* and evaluates them against the laws.

The two layers are not redundant — they are orthogonal. Together, they cover a much larger portion of the threat surface than either alone.

---

## Changes

### New files

**`src/constitution/audit.ts`**

Core audit logic. Key exports:
- `runConstitutionAudit(config, db, inference)` — runs a full audit cycle, returns `ConstitutionAuditResult`
- `hasCriticalViolation(result)` — checks whether a result contains any critical finding
- `formatAuditResult(result)` — formats a result for logging

Internally:
- `AUDIT_SYSTEM_PROMPT` — the auditor's instruction, with the Three Laws embedded
- `summarizeTurnsForAudit(turns)` — converts raw turn data into compact audit context

**`src/__tests__/constitution.test.ts`**

12 tests covering all execution paths.

### Modified files

**`src/types.ts`**
- `ConstitutionLaw` — interface for a single law
- `CONSTITUTION_LAWS` — the Three Laws, with their full text, as a constant (single source of truth shared by audit.ts and any future consumers)
- `ConstitutionViolationSeverity` — `'low' | 'medium' | 'high' | 'critical'`
- `ConstitutionAuditFinding` — a single finding: which law, severity, description, evidence
- `ConstitutionAuditResult` — complete audit result: id, timestamp, turns audited, pass/fail, findings, summary, model used, duration
- `constitutionAuditModel?: string` added to `AutomatonConfig`
- `insertConstitutionAudit` / `getRecentConstitutionAudits` added to `AutomatonDatabase` interface

**`src/state/schema.ts`**
- Added `constitution_audits` table to the main schema
- Schema version bumped to 4
- Added `MIGRATION_V4` — creates the `constitution_audits` table and its timestamp index for existing databases

**`src/state/database.ts`**
- `insertConstitutionAudit(result)` — serializes and writes an audit result
- `getRecentConstitutionAudits(limit)` — returns the N most recent results, newest first

**`src/heartbeat/tasks.ts`**
- Added `inference: InferenceClient` to `HeartbeatTaskContext` (audit needs to make its own inference calls)
- Registered `constitution_audit` as a built-in heartbeat task

**`src/heartbeat/daemon.ts`**
- Added `inference: InferenceClient` to `HeartbeatDaemonOptions`
- Passes `inference` through to the task context

**`src/index.ts`**
- Passes the existing `inference` client into `HeartbeatDaemon`

---

## Tests

All 22 pass (12 new + 10 existing). `npx tsc --noEmit` — zero errors.

```
src/__tests__/constitution.test.ts

  runConstitutionAudit
    ✓ returns a passing result when there are no recent turns
    ✓ fetches recent turns, summarizes them, and parses a passing audit response
    ✓ fetches recent turns and correctly parses a violation response
    ✓ assumes pass and logs when the inference call fails
    ✓ assumes pass and logs when the audit model returns malformed JSON
    ✓ uses constitutionAuditModel from config when explicitly set

  hasCriticalViolation
    ✓ returns false for a passing audit result
    ✓ returns true when the result contains a critical severity finding
    ✓ returns false when findings exist but none are critical

  formatAuditResult
    ✓ formats a passing audit result correctly
    ✓ formats a failed audit result with findings

  DB persistence
    ✓ inserts a constitution audit result and retrieves it via getRecentConstitutionAudits
```

---

## Future Work

- **Audit quorum** — require multiple independent audit models to agree before flagging critical violations, reducing false positives on edge cases
- **On-chain audit log** — commit audit result hashes to Base L2 for tamper-proof, publicly verifiable compliance history (the `id` field is designed for this)
- **Cross-automaton audit sharing** — automatons that detect novel violation patterns could publish them so the broader network learns what suspicious behavior looks like
- **Configurable violation response policy** — beyond `shouldWake`, support auto-pause, creator notification via social relay, or automatic rollback of the offending turn
- **Audit of the auditor** — a third model could audit the auditor's judgments. Deliberately not implemented to avoid infinite regress; one level of independent judgment is the pragmatic starting point
