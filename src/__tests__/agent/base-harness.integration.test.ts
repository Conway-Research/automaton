import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BaseHarness } from "../../agent/harnesses/base-harness.js";
import type { HarnessContext, HarnessTool } from "../../agent/harness-types.js";
import { InferenceAdmissionError } from "../../agent/harness-types.js";
import type { TaskNode, TaskResult } from "../../orchestration/task-graph.js";
import { AgentWorkspace } from "../../orchestration/workspace.js";
import { createInMemoryDb } from "../orchestration/test-db.js";
import { createTestConfig, createTestIdentity, MockConwayClient } from "../mocks.js";

class TestHarness extends BaseHarness {
  readonly id = "test";
  readonly description = "test harness";
  beforeTurnCalls = 0;

  buildSystemPrompt(): string {
    return "system prompt";
  }

  protected override beforeTurn(): void {
    this.beforeTurnCalls += 1;
  }

  getToolDefs(): HarnessTool[] {
    return [
      {
        name: "ping",
        description: "ping",
        parameters: { type: "object", properties: {} },
        execute: async () => "pong",
      },
      {
        name: "task_done",
        description: "done",
        parameters: {
          type: "object",
          properties: { summary: { type: "string" }, success: { type: "boolean" } },
          required: ["summary"],
        },
        execute: async (args) => `TASK_COMPLETE:${args.summary as string}`,
      },
    ];
  }
}

describe("agent/BaseHarness integration", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  function createTask(): TaskNode {
    return {
      id: "task-1",
      parentId: null,
      goalId: "goal-1",
      title: "Run test harness",
      description: "Use tools and finish",
      status: "assigned",
      assignedTo: "local://worker",
      agentRole: "generalist",
      priority: 50,
      dependencies: [],
      result: null,
      metadata: {
        estimatedCostCents: 5,
        actualCostCents: 0,
        maxRetries: 0,
        retryCount: 0,
        timeoutMs: 5_000,
        createdAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
      },
    };
  }

  function createContext(): HarnessContext {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "base-harness-"));
    const workspace = new AgentWorkspace("goal-1", path.join(tempDir, "workspace"));
    const db = createInMemoryDb();
    return {
      workspaceRoot: workspace.basePath,
      allowedEditRoot: tempDir,
      workspace,
      identity: createTestIdentity(),
      config: createTestConfig(),
      db,
      conway: new MockConwayClient(),
      inference: {
        chat: async () => ({
          content: "",
          toolCalls: [
            {
              id: "call-1",
              type: "function",
              function: { name: "ping", arguments: "{}" },
            },
            {
              id: "call-2",
              type: "function",
              function: { name: "task_done", arguments: JSON.stringify({ summary: "finished", success: true }) },
            },
          ],
        }),
      },
      budget: {
        maxTurns: 3,
        maxCostCents: 50,
        timeoutMs: 5_000,
        turnsUsed: 0,
        costUsedCents: 0,
        startedAt: 0,
      },
      wisdom: { conventions: [], successes: [], failures: [], gotchas: [] },
      abortSignal: new AbortController().signal,
      goalId: "goal-1",
    };
  }

  it("executes tool calls and returns a TaskResult on task_done", async () => {
    const harness = new TestHarness();
    const task = createTask();
    const context = createContext();
    await harness.initialize(task, context);
    const result = await harness.execute();
    expect(result.success).toBe(true);
    expect(result.output).toBe("finished");
    expect(result.quality?.status).toBe('UNVERIFIED');
    expect(context.budget.turnsUsed).toBe(1);
    (context.db as any).close?.();
  });

  it('sends the shared quality policy to the actual inference boundary',async()=>{
    const harness=new TestHarness(),context=createContext();
    const original=context.inference.chat;
    let observed=false;
    context.inference.chat=async(...args)=>{
      observed=JSON.stringify(args).includes('Quality applies to every task') &&
        JSON.stringify(args).includes('Quality remains UNVERIFIED');
      return original(...args);
    };
    try{await harness.initialize(createTask(),context);await harness.execute();expect(observed).toBe(true);}
    finally{(context.db as any).close?.();}
  });

  it.each(['research','marketing','support','data delivery','software','trading analysis','new unfamiliar sector'])
  ('sends task-specific continuing education to inference for %s',async(domain)=>{
    const harness=new TestHarness(),context=createContext(),task=createTask();
    task.title=domain;task.description='Complete a bounded assignment with domain-specific acceptance criteria';
    const original=context.inference.chat;let observed=false;
    context.inference.chat=async(...args)=>{
      const request=JSON.stringify(args);
      observed=request.includes('every assigned activity and future domain')&&request.includes('assess_task_specific_gap')&&
        request.includes('subject_knowledge')&&request.includes('No open-ended study');
      return original(...args);
    };
    try{await harness.initialize(task,context);await harness.execute();expect(observed).toBe(true);}
    finally{(context.db as any).close?.();}
  });

  it('rejects a batch with actions after completion before executing any tool',async()=>{
    const harness=new TestHarness(),context=createContext();let executed=0;
    const tools=harness.getToolDefs();harness.getToolDefs=()=>tools.map(t=>({...t,execute:async(args)=>{executed++;return t.execute(args);}}));
    context.inference.chat=async()=>({content:'',toolCalls:[
      {id:'done',type:'function',function:{name:'task_done',arguments:JSON.stringify({summary:'done',success:true})}},
      {id:'after',type:'function',function:{name:'ping',arguments:'{}'}},
    ]});
    try{await harness.initialize(createTask(),context);await expect(harness.execute()).rejects.toThrow('final tool call');expect(executed).toBe(0);}
    finally{(context.db as any).close?.();}
  });

  it('rejects malformed completion before tool execution and permits a bounded corrected retry',async()=>{
    const harness=new TestHarness(),context=createContext();let calls=0,executed=0;
    const tools=harness.getToolDefs();harness.getToolDefs=()=>tools.map(t=>({...t,execute:async(args)=>{executed++;return t.execute(args);}}));
    context.inference.chat=async()=>({content:'',toolCalls:[{id:`c-${++calls}`,type:'function',function:{name:'task_done',
      arguments:JSON.stringify({summary:'synthetic result',success:calls===1?'false':true})}}]});
    try{await harness.initialize(createTask(),context);const result=await harness.execute();expect(calls).toBe(2);expect(executed).toBe(1);expect(result.quality?.status).toBe('UNVERIFIED');}
    finally{(context.db as any).close?.();}
  });

  it.each(['pause','abort'] as const)('stops a response tool batch after %s during the first tool',async(mode)=>{
    const harness=new TestHarness(),context=createContext(),controller=new AbortController();
    context.abortSignal=controller.signal;
    let paused=false,executions=0;
    context.assertExecutionAllowed=()=>{if(paused)throw new InferenceAdmissionError('Fixture paused');};
    const tools=harness.getToolDefs();
    harness.getToolDefs=()=>tools.map(tool=>({...tool,execute:async(args)=>{
      executions++;
      if(mode==='pause')paused=true;else controller.abort();
      return tool.execute(args);
    }}));
    try{
      await harness.initialize(createTask(),context);
      await expect(harness.execute()).rejects.toBeInstanceOf(InferenceAdmissionError);
      expect(executions).toBe(1);
    }finally{(context.db as any).close?.();}
  });

  it("fails immediately when the turn budget is already exhausted", async () => {
    const harness = new TestHarness();
    const task = createTask();
    const context = createContext();
    context.budget.maxTurns = 0;
    await harness.initialize(task, context);
    await expect(harness.execute()).rejects.toThrow(/Budget exhausted: reached max turns/);
    (context.db as any).close?.();
  });

  it("stops on typed admission denial without retries or consumed turns", async () => {
    const harness = new TestHarness();
    const context = createContext();
    const denial = new InferenceAdmissionError('Evidence withdrawn');
    let calls = 0;
    context.inference = {chat: async () => { calls++; throw denial; }};
    try {
      await harness.initialize(createTask(), context);
      await expect(harness.execute()).rejects.toBe(denial);
      expect(calls).toBe(1);
      expect(context.budget.turnsUsed).toBe(0);
    } finally { (context.db as any).close?.(); }
  });

  it("retains retries for transient unclassified inference failures", async () => {
    const harness = new TestHarness();
    const task = createTask();
    const context = createContext();
    let callCount = 0;
    context.inference = {
      chat: async () => {
        callCount += 1;
        if (callCount === 1) {
          throw new Error("transient inference failure");
        }
        return {
          content: "",
          toolCalls: [
            {
              id: "call-1",
              type: "function",
              function: { name: "task_done", arguments: JSON.stringify({ summary: "finished after retry", success: true }) },
            },
          ],
        };
      },
    };

    await harness.initialize(task, context);
    const result = await harness.execute();

    expect(result.output).toBe("finished after retry");
    expect(callCount).toBe(2);
    expect(context.budget.turnsUsed).toBe(1);
    expect(harness.beforeTurnCalls).toBe(1);
    (context.db as any).close?.();
  });
});
