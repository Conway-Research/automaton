import {fixtureGrantAdapterPermission as grantAdapterPermission} from '../fixtures/security-review.js';
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SimpleAgentTracker, SimpleFundingProtocol } from "../../orchestration/simple-tracker.js";
import { createInMemoryDb } from "./test-db.js";
import type BetterSqlite3 from "better-sqlite3";
import {createDatabase} from '../../state/database.js';
import {initializeCapitalBudget} from '../../revenue/capital-budget.js';
import {registerBudgetPolicy} from '../../inference/budget-policy.js';

function createMockAutomatonDb(db: BetterSqlite3.Database) {
  return {
    raw: db,
    getChildren: () => {
      return db.prepare("SELECT id, name, address, sandbox_id AS sandboxId, genesis_prompt AS genesisPrompt, creator_message AS creatorMessage, funded_amount_cents AS fundedAmountCents, status, created_at AS createdAt, last_checked AS lastChecked FROM children").all();
    },
    updateChildStatus: (id: string, status: string) => {
      db.prepare("UPDATE children SET status = ? WHERE id = ?").run(status, id);
    },
    insertChild: (child: any) => {
      db.prepare("INSERT INTO children (id, name, address, sandbox_id, genesis_prompt, creator_message, funded_amount_cents, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(child.id, child.name, child.address, child.sandboxId, child.genesisPrompt, child.creatorMessage, child.fundedAmountCents, child.status, child.createdAt);
    },
  } as any;
}

function insertChild(
  db: BetterSqlite3.Database,
  id: string,
  name: string,
  address: string,
  status = "running",
  role = "generalist",
) {
  db.prepare(
    "INSERT INTO children (id, name, address, sandbox_id, genesis_prompt, funded_amount_cents, status, created_at, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(id, name, address, "sb-1", "test", 0, status, new Date().toISOString(), role);
}

describe("orchestration/simple-tracker", () => {
  let db: BetterSqlite3.Database;
  let mockDb: ReturnType<typeof createMockAutomatonDb>;
  let tracker: SimpleAgentTracker;

  beforeEach(() => {
    db = createInMemoryDb();
    mockDb = createMockAutomatonDb(db);
    tracker = new SimpleAgentTracker(mockDb);
  });

  afterEach(() => {
    db.close();
  });

  describe("getIdle", () => {
    it("returns children with running status not assigned to active tasks", () => {
      insertChild(db, "c1", "Alice", "0xalice", "running");

      const idle = tracker.getIdle();

      expect(idle).toHaveLength(1);
      expect(idle[0].address).toBe("0xalice");
      expect(idle[0].name).toBe("Alice");
    });

    it("returns children with healthy status not assigned to active tasks", () => {
      insertChild(db, "c1", "Bob", "0xbob", "healthy");

      const idle = tracker.getIdle();

      expect(idle).toHaveLength(1);
      expect(idle[0].address).toBe("0xbob");
      expect(idle[0].status).toBe("healthy");
    });

    it("excludes children assigned to active tasks", () => {
      insertChild(db, "c1", "Alice", "0xchild1", "running");
      insertChild(db, "c2", "Bob", "0xchild2", "running");

      db.prepare("INSERT INTO goals (id, title, description, status, created_at) VALUES (?, ?, ?, ?, ?)").run("g1", "Goal", "Desc", "active", new Date().toISOString());
      db.prepare(
        "INSERT INTO task_graph (id, goal_id, title, description, status, assigned_to, agent_role, priority, dependencies, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run("t1", "g1", "Task", "Desc", "assigned", "0xchild1", "generalist", 50, "[]", new Date().toISOString());

      const idle = tracker.getIdle();

      expect(idle).toHaveLength(1);
      expect(idle[0].address).toBe("0xchild2");
    });

    it("returns empty when no idle children exist", () => {
      const idle = tracker.getIdle();
      expect(idle).toHaveLength(0);
    });

    it("reads role from DB rather than hardcoding generalist", () => {
      insertChild(db, "c1", "Specialist", "0xspec", "running", "researcher");

      const idle = tracker.getIdle();

      expect(idle).toHaveLength(1);
      expect(idle[0].role).toBe("researcher");
    });

    it("excludes children with dead status", () => {
      insertChild(db, "c1", "Dead", "0xdead", "dead");

      const idle = tracker.getIdle();

      expect(idle).toHaveLength(0);
    });

    it("excludes children with sleeping status", () => {
      insertChild(db, "c1", "Sleeping", "0xsleep", "sleeping");

      const idle = tracker.getIdle();

      expect(idle).toHaveLength(0);
    });

    it("excludes children assigned to running tasks", () => {
      insertChild(db, "c1", "Busy", "0xbusy", "running");

      db.prepare("INSERT INTO goals (id, title, description, status, created_at) VALUES (?, ?, ?, ?, ?)").run("g1", "Goal", "Desc", "active", new Date().toISOString());
      db.prepare(
        "INSERT INTO task_graph (id, goal_id, title, description, status, assigned_to, agent_role, priority, dependencies, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run("t2", "g1", "Active Task", "Desc", "running", "0xbusy", "generalist", 50, "[]", new Date().toISOString());

      const idle = tracker.getIdle();

      expect(idle).toHaveLength(0);
    });
  });

  describe("getBestForTask", () => {
    it("returns the first idle agent", () => {
      insertChild(db, "c1", "First", "0xfirst", "running");
      insertChild(db, "c2", "Second", "0xsecond", "running");

      const best = tracker.getBestForTask("generalist");

      expect(best).not.toBeNull();
      expect(best?.address).toBe("0xfirst");
      expect(best?.name).toBe("First");
    });

    it("returns null when no idle agents are available", () => {
      const best = tracker.getBestForTask("generalist");
      expect(best).toBeNull();
    });
  });

  describe("updateStatus", () => {
    it("updates the child status in the DB", () => {
      insertChild(db, "c1", "Agent", "0xagent", "running");

      tracker.updateStatus("0xagent", "healthy");

      const row = db.prepare("SELECT status FROM children WHERE id = ?").get("c1") as { status: string } | undefined;
      expect(row?.status).toBe("healthy");
    });

    it("does nothing for an unknown address", () => {
      insertChild(db, "c1", "Agent", "0xagent", "running");

      expect(() => tracker.updateStatus("0xunknown", "healthy")).not.toThrow();

      const row = db.prepare("SELECT status FROM children WHERE id = ?").get("c1") as { status: string } | undefined;
      expect(row?.status).toBe("running");
    });
  });

  describe("register", () => {
    it("inserts a new child record into the DB", () => {
      tracker.register({
        address: "0xnew",
        name: "NewAgent",
        role: "analyst",
        sandboxId: "sb-42",
      });

      const children = mockDb.getChildren() as any[];
      expect(children).toHaveLength(1);
      expect(children[0].address).toBe("0xnew");
    });

    it("stores the role in the genesis prompt", () => {
      tracker.register({
        address: "0xrole",
        name: "RoleAgent",
        role: "security-expert",
        sandboxId: "sb-99",
      });

      const row = db.prepare("SELECT genesis_prompt FROM children WHERE address = ?").get("0xrole") as
        | { genesis_prompt: string }
        | undefined;
      expect(row?.genesis_prompt).toContain("security-expert");
    });
  });
});

describe("orchestration/SimpleFundingProtocol", () => {
  let fundingDb: BetterSqlite3.Database;
  const attribution={operationId:'op_fixture',experimentId:'experiment'};

  beforeEach(() => {
    fundingDb = createDatabase(':memory:').raw;
    initializeCapitalBudget(fundingDb,{capitalChfCents:1000,reserveChfCents:0,chfPerUsdNumerator:1,chfPerUsdDenominator:1,quoteExpiresAt:Date.now()+60000});
    registerBudgetPolicy(fundingDb,{daily_cents:1000,hourly_cents:1000,session_cents:1000,call_cents:1000,halted:0,revision:1});
    fundingDb.exec("INSERT INTO revenue_opportunities(id,name,status) VALUES('opportunity','fixture','active'); INSERT INTO revenue_experiments(id,opportunity_id,status,hypothesis,max_budget_cents,max_duration_hours,success_criteria,failure_criteria,stop_condition,started_at) VALUES('experiment','opportunity','running','fixture',1000,1,'success','failure','stop',datetime('now'))");
    grantAdapterPermission(fundingDb,{adapter:'child-funding',experimentId:'experiment',maxCostUsdCents:1000,expiresAt:Date.now()+60000,reviewedBy:'fixture'});
    // Insert a child for funding tests
    fundingDb.prepare(
      "INSERT INTO children (id, name, address, sandbox_id, genesis_prompt, funded_amount_cents, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run("c1", "child-1", "0x1111111111111111111111111111111111111111", "sb-1", "test", 0, "running", new Date().toISOString());
  });

  afterEach(() => {
    fundingDb.close();
  });

  function makeMockDb(raw: BetterSqlite3.Database) {
    return { raw } as any;
  }

  it("fundChild calls transferCredits with the correct amount", async () => {
    const mockConway = {
      transferCredits: vi.fn().mockResolvedValue({ status: "ok", transferId:"fixture-transfer", amountCents: 100, toAddress:'0x1111111111111111111111111111111111111111' }),
      getCreditsBalance: vi.fn().mockResolvedValue(500),
    } as any;

    const identity = { address: "0xparent" } as any;
    const funding = new SimpleFundingProtocol(mockConway, identity, makeMockDb(fundingDb));

    const result = await funding.fundChild("0x1111111111111111111111111111111111111111", 100,attribution);

    expect(result.success).toBe(true);
    expect(mockConway.transferCredits).toHaveBeenCalledWith(
      "0x1111111111111111111111111111111111111111",
      100,
      "Task funding from orchestrator",
    );
  });

  it("fundChild updates funded_amount_cents in the children table on success", async () => {
    const mockConway = {
      transferCredits: vi.fn().mockResolvedValue({ status: "ok",transferId:"fixture-transfer",amountCents:200,toAddress:'0x1111111111111111111111111111111111111111' }),
    } as any;

    const identity = { address: "0xparent" } as any;
    const funding = new SimpleFundingProtocol(mockConway, identity, makeMockDb(fundingDb));

    await funding.fundChild("0x1111111111111111111111111111111111111111", 200,attribution);

    const row = fundingDb.prepare("SELECT funded_amount_cents FROM children WHERE address = ?").get("0x1111111111111111111111111111111111111111") as any;
    expect(row.funded_amount_cents).toBe(200);
  });

  it("fundChild returns success:true for zero amount without calling transferCredits", async () => {
    const mockConway = {
      transferCredits: vi.fn(),
      getCreditsBalance: vi.fn().mockResolvedValue(0),
    } as any;

    const identity = { address: "0xparent" } as any;
    const funding = new SimpleFundingProtocol(mockConway, identity, makeMockDb(fundingDb));

    const result = await funding.fundChild("0x1111111111111111111111111111111111111111", 0);

    expect(result.success).toBe(true);
    expect(mockConway.transferCredits).not.toHaveBeenCalled();
  });

  it("fundChild returns success:false when transferCredits throws", async () => {
    const mockConway = {
      transferCredits: vi.fn().mockRejectedValue(new Error("network failure")),
      getCreditsBalance: vi.fn().mockResolvedValue(200),
    } as any;

    const identity = { address: "0xparent" } as any;
    const funding = new SimpleFundingProtocol(mockConway, identity, makeMockDb(fundingDb));

    const result = await funding.fundChild("0x1111111111111111111111111111111111111111", 50,attribution);

    expect(result.success).toBe(false);
  });

  it("getBalance returns funded_amount_cents from the children table", async () => {
    fundingDb.prepare("UPDATE children SET funded_amount_cents = 350 WHERE address = ?").run("0x1111111111111111111111111111111111111111");

    const mockConway = {} as any;
    const identity = { address: "0xparent" } as any;
    const funding = new SimpleFundingProtocol(mockConway, identity, makeMockDb(fundingDb));

    const balance = await funding.getBalance("0x1111111111111111111111111111111111111111");
    expect(balance).toBe(350);
  });

  it("getBalance returns 0 for unknown address", async () => {
    const mockConway = {} as any;
    const identity = { address: "0xparent" } as any;
    const funding = new SimpleFundingProtocol(mockConway, identity, makeMockDb(fundingDb));

    const balance = await funding.getBalance("0xunknown");
    expect(balance).toBe(0);
  });

  it("never substitutes a parent self-transfer for a child-authorized recall", async () => {
    // Fund the child first so there's a balance to recall
    fundingDb.prepare("UPDATE children SET funded_amount_cents = 500 WHERE address = ?").run("0x1111111111111111111111111111111111111111");

    const mockConway = {
      transferCredits: vi.fn().mockResolvedValue({ status: "ok", amountCents: 500 }),
      getCreditsBalance: vi.fn().mockResolvedValue(500),
    } as any;

    const identity = { address: "0xparent" } as any;
    const funding = new SimpleFundingProtocol(mockConway, identity, makeMockDb(fundingDb));

    const result = await funding.recallCredits("0x1111111111111111111111111111111111111111");

    expect(result).toEqual({success:false,amountCents:0});
    expect(mockConway.transferCredits).not.toHaveBeenCalled();
  });

  it("preserves tracked funding without an authenticated child-side recall", async () => {
    fundingDb.prepare("UPDATE children SET funded_amount_cents = 500 WHERE address = ?").run("0x1111111111111111111111111111111111111111");

    const mockConway = {
      transferCredits: vi.fn().mockResolvedValue({ status: "ok", amountCents: 500 }),
    } as any;

    const identity = { address: "0xparent" } as any;
    const funding = new SimpleFundingProtocol(mockConway, identity, makeMockDb(fundingDb));

    await funding.recallCredits("0x1111111111111111111111111111111111111111");

    const row = fundingDb.prepare("SELECT funded_amount_cents FROM children WHERE address = ?").get("0x1111111111111111111111111111111111111111") as any;
    expect(row.funded_amount_cents).toBe(500);
  });
  it.each(['submitted','pending','unknown','accepted','cancelled','',null])('does not classify an unconfirmed transfer status %s as settled funding',async status=>{
    const mockConway={transferCredits:vi.fn().mockResolvedValue({status,amountCents:100,toAddress:'0x1111111111111111111111111111111111111111'})};
    const funding=new SimpleFundingProtocol(mockConway as any,{address:'0xparent'} as any,makeMockDb(fundingDb));
    expect(await funding.fundChild('0x1111111111111111111111111111111111111111',100,attribution)).toEqual({success:false});
    expect(await funding.getBalance('0x1111111111111111111111111111111111111111')).toBe(0);
  });
  it.each([NaN,Infinity,-1,1.5,100000001])('rejects invalid funding %s before any provider call',async amount=>{
    const mockConway={transferCredits:vi.fn()};
    const funding=new SimpleFundingProtocol(mockConway as any,{address:'0xparent'} as any,makeMockDb(fundingDb));
    expect(await funding.fundChild('0x1111111111111111111111111111111111111111',amount,attribution)).toEqual({success:false});
    expect(mockConway.transferCredits).not.toHaveBeenCalled();
  });
  it.each([{amountCents:99,toAddress:'0x1111111111111111111111111111111111111111'},{amountCents:100,toAddress:'different'},{}])('rejects a receipt inconsistent with the funding intent',async receipt=>{
    const mockConway={transferCredits:vi.fn().mockResolvedValue({status:'completed',...receipt})};
    const funding=new SimpleFundingProtocol(mockConway as any,{address:'0xparent'} as any,makeMockDb(fundingDb));
    expect(await funding.fundChild('0x1111111111111111111111111111111111111111',100,attribution)).toEqual({success:false});expect(await funding.getBalance('0x1111111111111111111111111111111111111111')).toBe(0);
  });
});
