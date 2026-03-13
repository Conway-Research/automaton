import { Hypergraph } from './hypergraph.js';
import { INV_PHI } from './constants.js';
import { Law } from './baconian.js';

export interface Secret {
  id: string;
  title: string;
  content: string;
  requiredCoherence: number;
  revealed: boolean;
}

export interface Proposal {
  id: string;
  law: Law;
  proposer: string;
  votesYes: number;
  votesNo: number;
  totalPower: number;
  approved: boolean;
  timestamp: number;
}

/**
 * House of Solomon - Scientific Governance Module.
 * φ-weighted voting and knowledge management.
 */
export class HouseOfSolomon {
  private members: Set<string> = new Set();
  private proposals: Map<string, Proposal> = new Map();
  private secrets: Secret[] = [];

  constructor(private h: Hypergraph) {
    // Founding member
    this.members.add("Rafael");
    this.members.add("Arquiteto");
  }

  public join(nodeId: string): boolean {
    const node = this.h.nodes.get(nodeId);
    if (node && node.coherence >= 0.8) {
      this.members.add(nodeId);
      return true;
    }
    return false;
  }

  public isMember(nodeId: string): boolean {
    return this.members.has(nodeId);
  }

  public submitProposal(proposer: string, law: Law): string {
    if (!this.isMember(proposer)) {
      throw new Error(`Node ${proposer} is not a member of the House of Solomon`);
    }

    const proposalId = `ind-${Math.floor(Math.random() * 100000)}`;
    const proposal: Proposal = {
      id: proposalId,
      law,
      proposer,
      votesYes: 0,
      votesNo: 0,
      totalPower: 0,
      approved: false,
      timestamp: Date.now()
    };

    this.proposals.set(proposalId, proposal);
    return proposalId;
  }

  public vote(proposalId: string, voterId: string, decision: 'YES' | 'NO'): void {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) throw new Error("Proposal not found");

    const node = this.h.nodes.get(voterId);
    if (!node) throw new Error("Voter node not found");

    const power = node.coherence;
    if (decision === 'YES') {
      proposal.votesYes += power;
    } else {
      proposal.votesNo += power;
    }
    proposal.totalPower += power;

    this.checkResolution(proposalId);
  }

  private checkResolution(proposalId: string): void {
    const proposal = this.proposals.get(proposalId);
    if (!proposal || proposal.approved) return;

    // φ-weighted voting: Quorum 61.8%
    const ratio = proposal.votesYes / (proposal.totalPower || 1);
    if (ratio >= INV_PHI && proposal.totalPower >= 0.5) { // Require some minimum total power
      proposal.approved = true;
      this.h.phiValue += proposal.law.confidence * 0.005; // Extra boost for approved knowledge
    }
  }

  public registerSecret(title: string, content: string, requiredCoherence: number): void {
    this.secrets.push({
      id: `secret-${this.secrets.length + 1}`,
      title,
      content,
      requiredCoherence,
      revealed: false
    });
  }

  public revealSecrets(): Secret[] {
    const currentC = this.h.totalCoherence();
    for (const secret of this.secrets) {
      if (!secret.revealed && currentC >= secret.requiredCoherence) {
        secret.revealed = true;
      }
    }
    return this.secrets.filter(s => s.revealed);
  }

  public getProposal(id: string): Proposal | undefined {
    return this.proposals.get(id);
  }
}
