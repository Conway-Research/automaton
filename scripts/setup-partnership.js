#!/usr/bin/env node

/**
 * Enhanced Automaton Setup - Creator Partnership Model
 * Configures the AI-Human business partnership during initial setup
 */

import { promises as fs } from 'fs';
import * as readline from 'readline';
import { ethers } from 'ethers';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function setupPartnership() {
  console.log('\n🤝 Enhanced Automaton - Creator Partnership Setup');
  console.log('=====================================\n');
  
  console.log('This setup creates a symbiotic AI-Human business partnership where:');
  console.log('• You provide sales, relationships, and human capabilities');
  console.log('• The automaton provides 24/7 technical execution and scaling');
  console.log('• Revenue is automatically shared (default: 10% to creator)');
  console.log('• Both parties benefit from business success\n');

  // Creator identity
  const creatorName = await question('What is your name (creator)? ');
  const creatorWallet = await question('Enter your Ethereum wallet address (for revenue sharing): ');
  
  // Validate wallet address
  if (!ethers.utils.isAddress(creatorWallet)) {
    console.log('❌ Invalid Ethereum address. Please restart setup.');
    process.exit(1);
  }

  // Communication preferences
  console.log('\n📞 Communication Preferences');
  const preferredContact = await question('Preferred contact method (email/telegram/discord): ');
  const contactDetails = await question(`Enter your ${preferredContact} contact: `);
  const statusFrequency = await question('Status update frequency (daily/weekly/on_revenue): ');
  
  // Business parameters
  console.log('\n💼 Business Parameters');
  const revenueShare = await question('Revenue share percentage for creator (default 10%): ') || '10';
  const businessHoursStart = await question('Your business hours start (e.g., 09:00): ') || '09:00';
  const businessHoursEnd = await question('Your business hours end (e.g., 17:00): ') || '17:00';
  const timezone = await question('Your timezone (e.g., UTC, America/New_York): ') || 'UTC';

  // Approval requirements
  console.log('\n✅ Approval Requirements');
  console.log('Choose decisions requiring your approval:');
  const approvals = [];
  
  if (await question('Require approval for expenses >$500? (y/n): ') === 'y') {
    approvals.push('major_expense');
  }
  if (await question('Require approval for new service launches? (y/n): ') === 'y') {
    approvals.push('new_service_launch');
  }
  if (await question('Require approval for client contract changes? (y/n): ') === 'y') {
    approvals.push('client_contract_changes');
  }
  if (await question('Require approval for automaton replication? (y/n): ') === 'y') {
    approvals.push('replication_decision');
  }

  // Initial service offerings
  console.log('\n🛠 Initial Service Offerings');
  const services = [];
  
  if (await question('Offer website technical audits? (y/n): ') === 'y') {
    services.push({
      name: 'Technical Audits',
      price: '$200-500',
      humanRole: 'Sales, client relationships',
      automatonRole: 'Playwright analysis, reporting'
    });
  }
  
  if (await question('Offer website monitoring services? (y/n): ') === 'y') {
    services.push({
      name: 'Website Monitoring',
      price: '$50-200/month',
      humanRole: 'Client onboarding, SLA management',
      automatonRole: '24/7 monitoring, alerts'
    });
  }

  if (await question('Offer business automation consulting? (y/n): ') === 'y') {
    services.push({
      name: 'Automation Consulting',
      price: '$500-2000/project',
      humanRole: 'Needs assessment, solution design',
      automatonRole: 'Technical implementation'
    });
  }

  // Generate partnership configuration
  const partnershipConfig = {
    version: '1.0',
    createdAt: new Date().toISOString(),
    creator: {
      name: creatorName,
      wallet: creatorWallet,
      contact: {
        method: preferredContact,
        details: contactDetails
      },
      businessHours: {
        start: businessHoursStart,
        end: businessHoursEnd,
        timezone: timezone
      }
    },
    partnership: {
      revenueSharePercentage: parseInt(revenueShare),
      communicationPreferences: {
        preferredMethod: preferredContact,
        statusUpdateFrequency: statusFrequency,
        approvalRequired: approvals
      }
    },
    services: services,
    constitution: 'enhanced', // Use enhanced constitution with creator partnership
    businessModel: 'human_ai_symbiosis'
  };

  // Generate automaton genesis prompt
  const genesisPrompt = `You are ${creatorName}'s business partner automaton. Your mission is to build a successful service business together.

CREATOR PARTNERSHIP:
- Creator: ${creatorName} (${creatorWallet})
- Revenue Share: ${revenueShare}% to creator automatically
- Communication: ${preferredContact} (${contactDetails})
- Business Hours: ${businessHoursStart}-${businessHoursEnd} ${timezone}

YOUR ROLE:
- 24/7 technical execution and client service delivery
- Automated reporting, monitoring, and analysis  
- Scaling operations to handle multiple clients simultaneously
- Continuous learning and service improvement

CREATOR'S ROLE:
- Sales calls and relationship building
- Legal signatures and contract negotiations
- Strategic direction and market insights
- Quality assurance and ethical oversight

INITIAL SERVICES:
${services.map(s => `• ${s.name}: ${s.price} - You: ${s.automatonRole}, Creator: ${s.humanRole}`).join('\n')}

SUCCESS METRICS:
- Monthly recurring revenue growth
- Client satisfaction and retention
- Creator revenue share consistency
- Service quality and delivery speed

PARTNERSHIP PRINCIPLES:
1. Always honor the 10% revenue share to creator
2. Request human assistance for sales and relationship tasks
3. Maintain transparency with creator on all business activities  
4. Seek creator approval for: ${approvals.join(', ')}
5. Focus on premium services that leverage both human and AI capabilities

Begin by analyzing the current market for your initial services, identifying the first target clients, and requesting creator assistance for the initial outreach strategy.`;

  // Save configuration
  await fs.writeFile('./partnership-config.json', JSON.stringify(partnershipConfig, null, 2));
  await fs.writeFile('./genesis-prompt.txt', genesisPrompt);
  
  console.log('\n✅ Partnership Configuration Complete!');
  console.log('\nGenerated files:');
  console.log('• partnership-config.json - Full partnership configuration');
  console.log('• genesis-prompt.txt - Automaton initialization prompt');
  
  console.log('\n🚀 Next Steps:');
  console.log('1. Review the generated files');
  console.log('2. Run: npm run build');  
  console.log('3. Run: node dist/index.js --partnership-mode');
  console.log('4. Monitor your automaton\'s progress and provide human assistance when requested');
  
  console.log('\n💰 Revenue Sharing:');
  console.log(`• All client payments will automatically share ${revenueShare}% to your wallet`);
  console.log('• Partnership dashboard available via CLI tools');
  console.log('• Creator assistance requests will be sent to your preferred contact method');
  
  console.log('\n🤝 Partnership Success!');
  console.log(`Welcome to the future of AI-Human business collaboration, ${creatorName}!`);

  rl.close();
}

async function main() {
  try {
    await setupPartnership();
  } catch (error) {
    console.error('Setup failed:', error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}