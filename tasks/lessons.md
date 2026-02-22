# Lessons Learned

## PR #2: fix/stale-model-references (2026-02-21)

### Investigation Before Implementation
- The task description listed ~8 stale references with approximate line numbers. After pulling latest, some locations had shifted and some had already been fixed (e.g., `DEFAULT_CONFIG.inferenceModel` was already `"gpt-5.2"`). Always verify against current source before making changes.

### Model References vs Model Registry Data
- `STATIC_MODEL_BASELINE` in `inference/types.ts` contains entries for `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`. These are **registry data** (pricing, capabilities, etc.) -- NOT model selection. The routing matrix candidates are what determine which models get used at runtime. Keeping old models in the baseline is harmless and provides reference pricing data.

### The `lowComputeModel` Gap
- `createInferenceClient()` accepts an optional `lowComputeModel` parameter, but `index.ts` never passed it. This meant the `|| "gpt-4.1"` fallback in `setLowComputeMode` fired 100% of the time in production. The interface was designed correctly; the caller just wasn't using it.

### Two Bugs, Two PRs
- Bug A (stale model strings) and Bug B (router ignoring agent config) have different root causes. Bug A is simple string replacements. Bug B is architectural -- `switch_model` writes to config but doesn't update the running InferenceRouter's preferences. Keep them separate.

### Routing Matrix vs Inference Client
- The Phase 2.3 `InferenceRouter` now handles model selection via `DEFAULT_ROUTING_MATRIX`. The legacy `setLowComputeMode` in the inference client still fires from `loop.ts` but the router independently selects models. Both paths needed fixing -- the router via the routing matrix, and the legacy path via the fallback string.

### Test Assertions Need Updating
- When changing default config values or routing matrix candidates, existing tests that assert specific model names need updating. The `inference-router.test.ts` had assertions like `expect(model!.modelId).toBe("gpt-4.1-nano")` that needed to change to `"gpt-5-mini"` to match the new routing matrix.

## PR #3: fix/context-idle-loop-detection (2026-02-21)

### Investigation-First Approach Pays Off
- The task description was based on a pre-Feb-20-PR snapshot of the source. After pulling latest, the framework already had FOUR distinct defenses against maintenance loops (IDLE_ONLY_TOOLS filter, anti-repetition warning, loop detector, idle turn detector) — none of which were in the snapshot. Always verify assumptions against current source before proposing changes.

### The Feb 20 PR Already Addressed This Problem (Partially)
- Sigil clearly knew about the maintenance loop issue and added multiple defenses. The defenses work well for single-tool repetition but have blind spots for multi-tool maintenance loops where the agent varies tool combinations across turns. This context shaped the fix: extend the existing approach rather than introducing a new mechanism.

### Mock Tool Call ID Collisions
- `toolCallResponse()` in mocks.ts generates IDs using `Date.now()`. When multiple responses are created in the same millisecond (e.g., in an array literal), IDs collide. This causes `UNIQUE constraint failed: tool_calls.id` when the loop tries to persist turns. For tests requiring multiple consecutive tool-call turns, construct responses with explicit unique IDs instead of using `toolCallResponse()`.

### The `IDLE_ONLY_TOOLS` Set vs The `MUTATING_TOOLS` Set
- The codebase defines TWO overlapping tool classification sets: `IDLE_ONLY_TOOLS` (tools that are status-check only) and `MUTATING_TOOLS` (tools that change state). These are complements but not exact inverses — some tools are neither idle nor mutating (e.g., `read_file`). Both sets are recreated inside the while loop on every iteration. A cleanup PR could hoist them to module scope.

### Dead Code as Architectural Intent
- `summarizeTurns()` in context.ts is fully implemented and tested but never called from production code. This likely represents intentional deferral — the async version requires an inference call per summarization, which costs money. The synchronous one-liner compression in `buildContextMessages` was chosen instead. Don't wire up dead code without understanding why it was left unwired.

### Three-Layer Defense Model
- The maintenance loop is caused by three interacting weaknesses: (1) exact-pattern-only loop detection, (2) episodic memory reinforcement, (3) aggressive context window dropping. The fix addresses weakness (1) only. Weaknesses (2) and (3) are separate, larger changes that should be discussed with the maintainer before implementing.

## PR #4: fix/discovery-abi-mismatch (2026-02-22)

### Contract ABI Verification
- **Never trust an ABI defined in application code without verifying against the deployed contract.** Conway's `IDENTITY_ABI` declared `agentURI(uint256)` but the contract implements `tokenURI(uint256)`. This caused `discover_agents` to be completely broken for every agent on the platform. The ABI was likely written to match a draft spec, not the deployed contract.
- **Rule:** When working with on-chain calls, verify the ABI against the actual contract (Etherscan, Basescan, or direct `readContract` probing). Do not assume application-defined ABIs are correct.

### Silent Catch Blocks
- **Silent catch blocks that return default values can mask critical failures.** `getTotalAgents()` caught the `totalSupply()` revert and returned 0 — making it look like "no agents exist" instead of "the contract doesn't support this function." The correct fix: distinguish between "returned 0" (legitimate) and "reverted" (contract limitation), then fall back to an alternative method.
- **Rule:** When a catch block returns a default value, always log a warning. Silent failures are the hardest bugs to diagnose.

### Distinguish Contract Names from TypeScript Names
- The codebase had `agentURI` appearing in both the contract ABI (the Solidity view function) and TypeScript type properties (`RegistryEntry.agentURI`, `DiscoveredAgent.agentURI`). Only the contract function call needed to change — the TypeScript property names are internal and unrelated to the on-chain function name. Thorough grep + classification before coding prevented over-scoping the change.
- **Rule:** Before renaming anything, classify every reference as "contract call" vs "internal code" vs "parameter label." Only change what's actually broken.

### Promise.all Fragility
- `Promise.all([tokenURI, ownerOf])` in `queryAgent` meant that if either call reverted, the entire function returned null — even when `tokenURI` would have succeeded. Breaking the calls apart with individual try/catch blocks lets partial data through. In blockchain contexts where different contract functions have different implementation status, never couple unrelated calls in Promise.all.

## PR #5: fix/context-degradation-fallback (2026-02-22)

### Context Window Degradation

- **The 20-turn window size is not the root cause of maintenance loops.** The root cause is that LLMs weight conversational history more heavily than system prompt instructions. When maintenance turns fill the window, the behavioral pattern overwhelms genesis prompt directives — even though the mission is in the system prompt EVERY turn. Proof: wiping state.db (clearing history only) immediately restores productive behavior.
- **Rule:** When diagnosing agent behavioral degradation, look at what's IN the context window (information quality), not just how big it is (information quantity). The fix must ensure productive context is always visible, not just expand the window.

### Silent Fallback Paths

- **Fallback paths that silently degrade to minimal state can be worse than errors.** The IDLE filter's `allTurns.slice(-2)` fallback silently reduced context to 2 idle turns when all 20 were idle. The agent continued running but with zero productive context — a silent capability loss that's harder to diagnose than a crash.
- **Rule:** When implementing fallback paths, try harder before accepting the minimal state. Scan further back, try alternative data sources, log a warning. A fallback that gives up too easily creates a failure mode that's invisible until you observe the behavioral impact.

### Memory as Reinforcement Channel

- **Memory systems can reinforce the behaviors they record.** Episodic memory recorded every maintenance turn and surfaced them via review_memory, creating a feedback loop: agent checks memory → sees maintenance → continues maintenance. The IDLE filter fixed the turn context but left the memory channel open.
- **Rule:** When filtering one data channel (turns), check all other channels that feed the same model context (memory, working state, injected blocks). A filter on one channel is ineffective if the same information leaks through another.

### Default Classification Matters in Tests

- **`EpisodicMemoryManager.record()` defaults to `classification: "maintenance"` when no classification is specified.** The existing `MemoryRetriever` test used `ep.record()` without specifying classification, which silently defaulted to "maintenance." When we added a classification filter, this test broke because the entry was correctly filtered out. Tests should always specify explicit values for fields that affect filtering logic.
- **Rule:** When adding filters to data pipelines, search all tests that insert data into that pipeline for missing/default field values that the filter might now act on.
