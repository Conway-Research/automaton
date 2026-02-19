/**
 * Creator Partnership System
 * Implements the enhanced constitution's creator partnership model
 */

import { AutomatonConfig, AutomatonState } from '../types.js';
import { getWallet } from '../identity/wallet.js';
import { log } from '../utils.js';

export interface CreatorPartnership {
  creatorWallet: string;
  revenueSharePercentage: number;
  communicationPreferences: CreatorCommPrefs;
  availabilitySchedule: AvailabilitySchedule;
  partnershipStartDate: Date;
  totalRevenueShared: number;
  lastContactDate?: Date;
}

export interface CreatorCommPrefs {
  email?: string;
  telegram?: string;
  discord?: string;
  preferredMethod: 'email' | 'telegram' | 'discord' | 'onchain';
  statusUpdateFrequency: 'daily' | 'weekly' | 'on_revenue' | 'major_decisions';
  approvalRequired: string[]; // List of decisions requiring creator approval
}

export interface AvailabilitySchedule {
  timezone: string;
  businessHours: {
    start: string; // "09:00"
    end: string;   // "17:00"
  };
  availableDays: string[]; // ["monday", "tuesday", ...]
  emergencyContact: boolean;
}

export interface HumanAssistanceRequest {
  id: string;
  type: 'sales_call' | 'legal_signature' | 'api_access' | 'strategic_consultation' | 'relationship_building';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  description: string;
  clientContext?: any;
  deadline?: Date;
  estimatedDuration?: string;
  compensation?: number;
  status: 'requested' | 'approved' | 'in_progress' | 'completed' | 'declined';
  createdAt: Date;
  resolvedAt?: Date;
}

export interface RevenueShare {
  id: string;
  amount: number;
  creatorShare: number;
  automatonShare: number;
  clientId: string;
  serviceType: string;
  transactionHash?: string;
  createdAt: Date;
  status: 'pending' | 'completed' | 'failed';
}

export class PartnershipManager {
  private partnership: CreatorPartnership;
  private pendingAssistanceRequests: Map<string, HumanAssistanceRequest> = new Map();
  private revenueHistory: RevenueShare[] = [];

  constructor(partnership: CreatorPartnership) {
    this.partnership = partnership;
  }

  /**
   * Process payment and automatically share revenue with creator
   */
  async processRevenue(amount: number, clientId: string, serviceType: string): Promise<RevenueShare> {
    const creatorShare = amount * (this.partnership.revenueSharePercentage / 100);
    const automatonShare = amount - creatorShare;

    const revenueShare: RevenueShare = {
      id: this.generateId(),
      amount,
      creatorShare,
      automatonShare,
      clientId,
      serviceType,
      createdAt: new Date(),
      status: 'pending'
    };

    try {
      // Transfer to creator wallet
      const wallet = await getWallet();
      const txHash = await this.transferToCreator(creatorShare);
      
      revenueShare.transactionHash = txHash;
      revenueShare.status = 'completed';
      
      // Update totals
      this.partnership.totalRevenueShared += creatorShare;
      
      // Notify creator
      await this.notifyCreator({
        type: 'revenue_share',
        amount: creatorShare,
        client: clientId,
        service: serviceType,
        transaction: txHash
      });

      log(`Revenue shared: ${creatorShare} to creator, ${automatonShare} retained`, 'info');
      
    } catch (error) {
      revenueShare.status = 'failed';
      log(`Failed to share revenue: ${error}`, 'error');
      
      // Queue for retry
      this.queueRevenueRetry(revenueShare);
    }

    this.revenueHistory.push(revenueShare);
    return revenueShare;
  }

  /**
   * Request human assistance from creator
   */
  async requestHumanAssistance(request: Omit<HumanAssistanceRequest, 'id' | 'status' | 'createdAt'>): Promise<string> {
    const assistanceRequest: HumanAssistanceRequest = {
      ...request,
      id: this.generateId(),
      status: 'requested',
      createdAt: new Date()
    };

    this.pendingAssistanceRequests.set(assistanceRequest.id, assistanceRequest);

    // Notify creator based on priority and preferences
    await this.notifyCreator({
      type: 'assistance_request',
      request: assistanceRequest,
      urgent: request.priority === 'urgent'
    });

    log(`Human assistance requested: ${request.type} (${request.priority})`, 'info');
    return assistanceRequest.id;
  }

  /**
   * Check if creator approval is required for a decision
   */
  requiresCreatorApproval(decisionType: string): boolean {
    return this.partnership.communicationPreferences.approvalRequired.includes(decisionType);
  }

  /**
   * Request creator approval for major decision
   */
  async requestApproval(decision: any): Promise<boolean> {
    if (!this.requiresCreatorApproval(decision.type)) {
      return true; // Auto-approved
    }

    await this.notifyCreator({
      type: 'approval_request',
      decision,
      timeout: decision.urgent ? '1h' : '24h'
    });

    // In real implementation, this would wait for creator response
    // For now, return true after logging
    log(`Creator approval requested for: ${decision.type}`, 'info');
    return true;
  }

  /**
   * Send status update to creator
   */
  async sendStatusUpdate(summary: any): Promise<void> {
    const shouldSend = this.shouldSendStatusUpdate();
    if (!shouldSend) return;

    await this.notifyCreator({
      type: 'status_update',
      summary,
      timestamp: new Date()
    });

    this.partnership.lastContactDate = new Date();
    log('Status update sent to creator', 'info');
  }

  /**
   * Calculate creator revenue share from automaton success
   */
  getCreatorShareMetrics(): any {
    const totalRevenue = this.revenueHistory.reduce((sum, share) => sum + share.amount, 0);
    const totalShared = this.partnership.totalRevenueShared;
    const sharePercentage = totalRevenue > 0 ? (totalShared / totalRevenue) * 100 : 0;

    return {
      totalRevenue,
      totalShared,
      sharePercentage,
      recentShares: this.revenueHistory.slice(-10),
      partnershipDuration: Date.now() - this.partnership.partnershipStartDate.getTime()
    };
  }

  private async transferToCreator(amount: number): Promise<string> {
    // Implementation would use actual blockchain transfer
    // This is a placeholder for the concept
    log(`[SIMULATED] Transferring ${amount} to creator wallet: ${this.partnership.creatorWallet}`, 'info');
    return `0x${Math.random().toString(16).substring(2, 18)}`;
  }

  private async notifyCreator(notification: any): Promise<void> {
    const method = this.partnership.communicationPreferences.preferredMethod;
    
    // Implementation would send via chosen method
    // This is a placeholder showing the concept
    log(`[NOTIFY_CREATOR via ${method}] ${JSON.stringify(notification)}`, 'info');
  }

  private shouldSendStatusUpdate(): boolean {
    const freq = this.partnership.communicationPreferences.statusUpdateFrequency;
    const lastContact = this.partnership.lastContactDate;
    
    if (!lastContact) return true;
    
    const hoursSinceContact = (Date.now() - lastContact.getTime()) / (1000 * 60 * 60);
    
    switch (freq) {
      case 'daily': return hoursSinceContact >= 24;
      case 'weekly': return hoursSinceContact >= 168;
      case 'on_revenue': return false; // Only send when revenue is processed
      case 'major_decisions': return false; // Only send for approvals
      default: return false;
    }
  }

  private queueRevenueRetry(share: RevenueShare): void {
    // Implementation would queue for later retry
    log(`Queuing revenue share retry for ${share.id}`, 'warn');
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}

// Export default creator partnership configuration
export const DEFAULT_PARTNERSHIP: Partial<CreatorPartnership> = {
  revenueSharePercentage: 10, // 10% to creator as per constitution
  communicationPreferences: {
    preferredMethod: 'email',
    statusUpdateFrequency: 'weekly',
    approvalRequired: [
      'major_expense', // >$500
      'new_service_launch',
      'client_contract_changes',
      'replication_decision',
      'strategic_pivot'
    ]
  }
};