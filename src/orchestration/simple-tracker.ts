import {securityTransaction} from '../security/action-gate.js';
import { ulid } from "ulid";
import {reserveCapitalCommitment} from '../revenue/capital-budget.js';
import {ExperimentBudgetGovernor} from '../revenue/budget-governor.js';
import {RevenueStore} from '../revenue/store.js';
import {assertAdapterPermission} from '../revenue/adapter-permissions.js';
import {pendingChildFundingCost} from '../revenue/pending-operations.js';
import type {
  AutomatonDatabase,
  AutomatonIdentity,
  ChildStatus,
  ConwayClient,
} from "../types.js";
import type { AgentTracker, FundingProtocol } from "./types.js";

const IDLE_STATUSES = new Set<ChildStatus>(["running", "healthy"]);

export class SimpleAgentTracker implements AgentTracker {
  constructor(private readonly db: AutomatonDatabase) {}

  getIdle(): { address: string; name: string; role: string; status: string }[] {
    const assignedRows = this.db.raw.prepare(
      `SELECT DISTINCT assigned_to AS address
       FROM task_graph
       WHERE assigned_to IS NOT NULL
         AND status IN ('assigned', 'running')`,
    ).all() as { address: string }[];

    const assignedAddresses = new Set(
      assignedRows
        .map((row) => row.address)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    );

    const children = this.db.raw.prepare(
      `SELECT id, name, address, status, COALESCE(role, 'generalist') AS role
       FROM children
       WHERE status IN ('running', 'healthy')`,
    ).all() as { id: string; name: string; address: string; status: string; role: string }[];

    return children
      .filter((child) => IDLE_STATUSES.has(child.status as ChildStatus) && !assignedAddresses.has(child.address))
      .map((child) => ({
        address: child.address,
        name: child.name,
        role: child.role,
        status: child.status,
      }));
  }

  getBestForTask(_role: string): { address: string; name: string } | null {
    const idle = this.getIdle();
    if (idle.length === 0) {
      return null;
    }

    return {
      address: idle[0].address,
      name: idle[0].name,
    };
  }

  updateStatus(address: string, status: string): void {
    const child = this.db.getChildren().find((entry) => entry.address === address);
    if (!child) {
      return;
    }

    this.db.updateChildStatus(child.id, status as ChildStatus);
  }

  register(agent: { address: string; name: string; role: string; sandboxId: string }): void {
    this.db.insertChild({
      id: ulid(),
      name: agent.name,
      address: agent.address as `0x${string}`,
      sandboxId: agent.sandboxId,
      genesisPrompt: `Role: ${agent.role}`,
      creatorMessage: "registered by orchestrator",
      fundedAmountCents: 0,
      status: "running",
      createdAt: new Date().toISOString(),
    });
  }
}

export class SimpleFundingProtocol implements FundingProtocol {
  constructor(
    private readonly conway: ConwayClient,
    _identity: AutomatonIdentity,
    private readonly db: AutomatonDatabase,
  ) {}

  async fundChild(childAddress: string, amountCents: number, attribution?:{operationId:string;experimentId:string}): Promise<{ success: boolean }> {
    if(!Number.isSafeInteger(amountCents)||amountCents<0||amountCents>100000000)return {success:false};
    const transferAmount = amountCents;
    if (transferAmount === 0) {
      return { success: true };
    }
    // Unavailable transport cannot reserve capital or create a pending transfer.
    if(this.conway.isLocal)return {success:false};
    if(!attribution||!/^op_[A-Za-z0-9_-]{1,90}$/.test(attribution.operationId)||!attribution.experimentId||attribution.experimentId.length>100||
      typeof childAddress!=='string'||!/^0x[a-fA-F0-9]{40}$/.test(childAddress))return {success:false};
    const {operationId,experimentId}=attribution;
    const payload=JSON.stringify({childAddress,amountCents,experimentId});
    try {
      const existing=securityTransaction(this.db.raw,()=>{
        this.db.raw.exec(`CREATE TABLE IF NOT EXISTS obolus_child_funding(id TEXT PRIMARY KEY,payload TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','confirmed')),receipt TEXT);
          CREATE UNIQUE INDEX IF NOT EXISTS child_funding_receipt ON obolus_child_funding(receipt) WHERE receipt IS NOT NULL;
          CREATE TRIGGER IF NOT EXISTS child_funding_identity_immutable BEFORE UPDATE OF id,payload ON obolus_child_funding BEGIN SELECT RAISE(ABORT,'Funding intent immutable'); END;
          CREATE TRIGGER IF NOT EXISTS child_funding_final_immutable BEFORE UPDATE ON obolus_child_funding WHEN OLD.status='confirmed' BEGIN SELECT RAISE(ABORT,'Funding receipt immutable'); END;
          CREATE TRIGGER IF NOT EXISTS child_funding_no_delete BEFORE DELETE ON obolus_child_funding BEGIN SELECT RAISE(ABORT,'Funding history immutable'); END;`);
        const old=this.db.raw.prepare('SELECT payload,status FROM obolus_child_funding WHERE id=?').get(operationId) as {payload:string;status:string}|undefined;
        if(old){
          if(old.payload!==payload)throw new Error('Conflicting child funding intent');
          pendingChildFundingCost(this.db.raw);
          if(this.db.raw.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='obolus_child_funding_closures'").get()&&
            this.db.raw.prepare('SELECT 1 FROM obolus_child_funding_closures WHERE operation_id=?').get(operationId))return true;
          const hold=this.db.raw.prepare('SELECT usd_cents FROM aureus_capital_commitments WHERE id=?').get(operationId) as {usd_cents:number}|undefined;
          if(hold?.usd_cents!==amountCents||this.db.raw.prepare('SELECT 1 FROM aureus_capital_settlements WHERE id=?').get(operationId))throw new Error('Child funding capital hold mismatch');
          return old.status==='confirmed';
        }
        const closures=!!this.db.raw.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='obolus_child_funding_closures'").get();
        if(this.db.raw.prepare(`SELECT 1 FROM obolus_child_funding f WHERE status='pending' ${closures?'AND NOT EXISTS(SELECT 1 FROM obolus_child_funding_closures c WHERE c.operation_id=f.id)':''} LIMIT 1`).get())throw new Error('Unresolved child funding requires reconciliation');
        if(!this.db.raw.prepare("SELECT 1 FROM sqlite_master WHERE name='aureus_capital_policy' AND type='table'").get()||
          !this.db.raw.prepare('SELECT 1 FROM aureus_capital_policy WHERE id=1').get())throw new Error('Capital policy required');
        const spending=this.db.raw.prepare('SELECT halted FROM inference_budget_policy WHERE id=1').get() as {halted:number}|undefined;
        if(!spending||spending.halted!==0)throw new Error('Shared spending stopped or unconfigured');
        if(!this.db.raw.prepare('SELECT 1 FROM children WHERE address=?').get(childAddress))throw new Error('Registered child required');
        const experiment=new RevenueStore(this.db.raw).getExperiment(experimentId);
        if(!experiment||experiment.status!=='running'||!experiment.startedAt||!experiment.maxDurationHours||!experiment.successCriteria||!experiment.failureCriteria||!experiment.stopCondition)throw new Error('Bounded running experiment required');
        const governor=new ExperimentBudgetGovernor(this.db.raw);
        if(!governor.checkDuration(experimentId).allowed||!governor.checkTotalBudget(experimentId,amountCents).allowed)throw new Error('Child funding budget denied');
        assertAdapterPermission(this.db.raw,'child-funding',experimentId,amountCents);
        if(this.db.raw.prepare('SELECT 1 FROM aureus_capital_commitments WHERE id=?').get(operationId))throw new Error('Existing commitment requires reconciliation');
        reserveCapitalCommitment(this.db.raw,operationId,'Remote child capital allocation',amountCents);
        this.db.raw.prepare("INSERT INTO obolus_child_funding VALUES(?,?,'pending',NULL)").run(operationId,payload);
        return null;
      }).immediate();
      if(existing!==null)return {success:existing};
      let timer:ReturnType<typeof setTimeout>|undefined;
      const result = await Promise.race([this.conway.transferCredits(
        childAddress,
        transferAmount,
        "Task funding from orchestrator",
      ),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Funding acknowledgement timed out')),15000);})]).finally(()=>clearTimeout(timer));

      const success = isTransferSuccessful(result.status)&&result.amountCents===transferAmount&&result.toAddress===childAddress&&
        typeof result.transferId==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(result.transferId);
      if (success) {
        securityTransaction(this.db.raw,()=>{
          if(this.db.raw.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='obolus_child_funding_closures'").get()&&
            this.db.raw.prepare('SELECT 1 FROM obolus_child_funding_closures WHERE funding_ref=? AND operation_id<>?').get(result.transferId,operationId))throw new Error('Transfer already reconciled to another allocation');
          this.db.raw.prepare("UPDATE obolus_child_funding SET status='confirmed',receipt=? WHERE id=? AND status='pending'").run(result.transferId,operationId);
          this.db.raw.prepare(
          "UPDATE children SET funded_amount_cents = funded_amount_cents + ? WHERE address = ?",
        ).run(transferAmount, childAddress);
        }).immediate();
      }
      // Even confirmed delivery is allocated child capital, not verified
      // consumption or refundable cash. Keep the shared hold until an
      // authenticated remote reconciliation can account for it.

      return { success };
    } catch {
      return { success: false };
    }
  }

  async recallCredits(childAddress: string): Promise<{ success: boolean; amountCents: number }> {
    const balance = await this.getBalance(childAddress);
    if (balance === 0) {
      return { success: true, amountCents: 0 };
    }
    // transferCredits acts on the calling parent's account; it cannot debit a
    // child. Sending to the parent again is not a recall. Preserve tracked
    // funding until an authenticated child-side transfer can be reconciled.
    return { success: false, amountCents: 0 };
  }

  // TODO: The Conway API only exposes getCreditsBalance() for the calling agent's own
  // balance. There is no API to query a child agent's balance remotely. This method
  // returns the locally tracked funded_amount_cents as an upper-bound estimate.
  // This is an approximation — the child may have spent credits on inference since
  // funding. When the Conway API adds per-agent balance queries, replace this with
  // a direct API call. Alternatively, child agents could report their balance via
  // messaging (status_report with credit_balance field).
  async getBalance(childAddress: string): Promise<number> {
    const row = this.db.raw
      .prepare("SELECT funded_amount_cents FROM children WHERE address = ?")
      .get(childAddress) as { funded_amount_cents: number } | undefined;

    return row?.funded_amount_cents ?? 0;
  }
}

function isTransferSuccessful(status: unknown): boolean {
  return typeof status==='string'&&['ok','completed','succeeded','success'].includes(status.trim().toLowerCase());
}
