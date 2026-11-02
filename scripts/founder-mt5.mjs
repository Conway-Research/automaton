import {readMonitorOverviewData} from './numaron-monitor-overview.mjs';
import {openConfiguredReferenceAdmin} from './founder-reference-composition.mjs';
import {createIncomeRefresh} from './founder-income-refresh.mjs';
import {readUSDCQuote} from './founder-order-income-fx.mjs';
import {publishOrderIncome} from './founder-order-income.mjs';
import {createProductionGithubFunding} from './founder-production-github-funding.mjs';
import {createProductionOrderBindings} from './founder-production-order-bindings.mjs';
import {readGeneralWebConfiguration} from './founder-general-web.mjs';
import {readLearningConfiguration} from './founder-learning-config.mjs';
import {openFounderPower} from './founder-power.mjs';
import {openHistoryStore} from '../src/revenue/long-history/store.ts';
import {openHistoryRunner} from '../src/revenue/long-history/runner.ts';
import {createTradeEvidence} from './trade-evidence.mjs';

import {openFounderTrading} from './founder-trading.mjs';
import {openDemoExecution,withDemoExecution} from './founder-demo-execution.mjs';

import {tradingKnowledge} from '../src/revenue/trading-knowledge.ts';

import {createTradeRadar} from './trade-radar.mjs';

import {loadFounderMission} from './founder-mission.mjs';

import {openFounderBilling} from './founder-billing.mjs';

import {openFounderCostImport} from './founder-cost-import.mjs';

import {openFounderLedger} from './founder-ledger.mjs';



import {openFounderOperations} from './founder-operations.mjs';



import { startFounderDashboard,createFounderStore } from './founder-dashboard.mjs';



import {createDemoMt5Readers} from './founder-mt5-demo.mjs';



import { resolve } from 'node:path';



import { spawn } from 'node:child_process';



import {reconcileFounderFinance} from './founder-finance.mjs';



import { readStripeAccount,readStripeTransactions } from './stripe-account-check.mjs';



import { readCoinbaseAccounts } from './coinbase-account-check.mjs';



import fs from 'node:fs';



import {openTradeJournal} from './trade-journal.mjs';



import {openFounderRuntime} from './founder-runtime.mjs';



import {readFounderKey} from './founder-key.mjs';







const [python, terminal, login, server, coinbaseKeyFile, stripeKeyFile] = process.argv.slice(2);



if (!python || !terminal || !/^\d+$/.test(login ?? '') || !server)



 throw Error('Required: PYTHON TERMINAL LOGIN SERVER');



const mt5Readers=createDemoMt5Readers({python:resolve(python),profileFile:resolve('artifacts/founder-integration-20261012/mt5-demo-profile.json')});



fs.mkdirSync(resolve('artifacts/founder-integration-20261012'),{recursive:true});



const tradeJournal=openTradeJournal(resolve('artifacts/founder-integration-20261012/trade-journal-demo.db'));



const operations=openFounderOperations(resolve('artifacts/founder-integration-20261012/founder-operations.db'));



const ledger=openFounderLedger(resolve('artifacts/founder-integration-20261012/founder-finance.db'));



const costImport=openFounderCostImport(resolve('artifacts/founder-integration-20261012/founder-finance.db'));

const getApiKey=()=>{try{return readFounderKey(JSON.parse(fs.readFileSync(resolve('artifacts/founder-autonomy-20261013/provider.json'),'utf8')).keyFile);}catch{return undefined;}};



let power,referenceAdministration;
const powerOn=()=>power?.isOn()===true;
const generalWebSearch=readGeneralWebConfiguration(resolve('artifacts/founder-web-search-config.json'));
const learningConfiguration=readLearningConfiguration(resolve('artifacts/founder-learning-config.json'));
const autonomy=openFounderRuntime({base:resolve('.'),requireCurrentQueueReview:true,capabilityEvidenceStore:{snapshot:()=>referenceAdministration?referenceAdministration.evidenceSnapshot():{certificates:[],revocations:[]}},githubFunding:createProductionGithubFunding({isEnabled:powerOn}),restorationOptions:createProductionOrderBindings({base:resolve('.'),isEnabled:powerOn,officeVisualRuntime:{"soffice":"C:\\Users\\Patrice\\automaton\\outputs\\ugig-docx-visual-20261021\\runtime\\libreoffice\\program\\soffice.com","rendererSha256":"ff9414529bfdf970ae51d54c6e79cd6aa05b19409adcdb8391d423bd0857a5f2","poppler":"C:/Users/Patrice/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin"},officeRuntime:{"generatorVersion":"3f766603e422d706fee41d7da24714e0797f29ecb7851421640aeca25172c9e5","python":"C:/Users/Patrice/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe"},referenceAuthorityForSource:sourceId=>({sourceId,allows:binding=>referenceAdministration?.authority(sourceId).allows(binding)===true})}),generalWebSearch,learningOptions:learningConfiguration.enabled?{...learningConfiguration,historySnapshot:()=>longHistory.snapshot(),historyTick:options=>longHistory.tick(options),admitMarketSource:probe=>longHistory.admitSource(probe)}:undefined,isEnabled:powerOn,getApiKey,mission:loadFounderMission(),stripeKeyFile:stripeKeyFile?resolve(stripeKeyFile):undefined,activate:true});
await autonomy.checkLocalReadiness();



const tradeEvidence=createTradeEvidence({file:resolve('artifacts/founder-integration-20261012/trade-evidence-demo.json'),python:resolve(python),terminal:resolve(terminal),login,server,script:resolve('scripts/mt5-strategy-evidence.py'),historyReader:symbols=>mt5Readers.history(symbols),control:()=>powerOn()?autonomy.controlState().status:'stopped'});

const tradeRadar=createTradeRadar({file:resolve('artifacts/founder-integration-20261012/trade-radar-demo.json'),control:()=>powerOn()?autonomy.controlState().status:'stopped',evidence:()=>tradeEvidence.snapshot(),read:async({start})=>{await tradeEvidence.refresh(tradeRadar.snapshot().setups?.map(p=>p.symbol)??[]);const m=await mt5Readers.market({start});tradeEvidence.observe(m.rows.filter(r=>r.entry).map(r=>r.symbol));return m;}});

const demoExecution=openDemoExecution({file:resolve('artifacts/founder-integration-20261012/demo-execution-20261017.db'),profileFile:resolve('artifacts/founder-integration-20261012/mt5-demo-profile.json'),python:resolve(python),isEnabled:()=>powerOn()&&autonomy.controlState().status==='running',read:({start,watch,dayWindow})=>mt5Readers.market({start,watch,dayWindow},'trading')});
const tradingEngine=withDemoExecution(openFounderTrading({file:resolve('artifacts/founder-integration-20261012/autonomous-trading-demo-20261016.db'),knowledge:tradingKnowledge(),historyLessons:()=>longHistory.lessons(),researchControl:()=>powerOn()&&autonomy.controlState().status==='running',read:({start,watch,dayWindow})=>mt5Readers.market({start,watch,dayWindow},'trading')}),demoExecution);

const historyStore=openHistoryStore(resolve('artifacts/numaron-long-history'));
const longHistory=openHistoryRunner({store:historyStore,knowledge:tradingKnowledge(),externalScheduling:learningConfiguration.enabled});

const billing=openFounderBilling(resolve('.'),{isEnabled:powerOn});
power=openFounderPower({file:resolve('artifacts/founder-integration-20261012/power-state.jsonl'),caller:'founder-dashboard',modules:[
 {name:'Aufgaben und AI-FÃ¤higkeiten',start(){const s=autonomy.controlState();if(s.status!=='running')autonomy.control({action:s.status==='paused'?'resume':'start',revision:s.revision});autonomy.startLoop();},stop(){const s=autonomy.controlState();autonomy.control({action:'stop',revision:s.revision});}},
 {name:'Langzeit- und Strategieforschung',start(){longHistory.control('resume');longHistory.start();},stop(){longHistory.control('stop');}},
 {name:'Trading-Analyse und Marktbeobachtung',start(){tradeRadar.start();tradingEngine.start();},stop(){tradingEngine.suspend();}},
 {name:'Automatischer Kostenabruf',start(){billing.start();},stop(){billing.pause();}}
]});
power.reconcile();
let incomeClosing=false;
const incomeActive=()=>!incomeClosing&&powerOn();
const refreshIncome=createIncomeRefresh({isOn:incomeActive,readQuote:()=>readUSDCQuote({isOn:incomeActive}),saveQuote:quote=>{const file=resolve('artifacts/founder-order-income-usdc-chf.json');fs.writeFileSync(file+'.tmp',JSON.stringify(quote));fs.renameSync(file+'.tmp',file);},publish:()=>publishOrderIncome(resolve('.')),onError:message=>console.error(message)});
const incomeTimer=setInterval(()=>void refreshIncome(),15000);
incomeTimer.unref();
void refreshIncome();


referenceAdministration=openConfiguredReferenceAdmin({base:resolve('.'),readPower:()=>power.snapshot()});
const ui=await startFounderDashboard({readSourceOverview:()=>readMonitorOverviewData(resolve('web/founder/interaction.mjs'),resolve('artifacts/numaron-local-monitor/source-overview.json')),referenceAdmin:referenceAdministration?.admin,port:51439,auditFile:resolve('artifacts/founder-integration-20261012/security-http.jsonl'),loginFile:resolve(process.env.LOCALAPPDATA??'.','Numaron/dashboard/login.json'),power,ledger,costImport,billing,store:createFounderStore(resolve('.'),operations),autonomy,tradeJournal,tradeRadar,tradingEngine,longHistory,readFinance:stripeKeyFile?async()=>reconcileFounderFinance(await readStripeTransactions(resolve(stripeKeyFile),{windowDays:732})):undefined,readStripe:stripeKeyFile?()=>readStripeAccount(resolve(stripeKeyFile)):undefined,readCoinbase:coinbaseKeyFile?()=>readCoinbaseAccounts(resolve(coinbaseKeyFile)):undefined,readTrading:async()=>{



 const result=await mt5Readers.account();



 // No account identifier or server details sent to the browser.



 delete result.account.login;delete result.account.server;



 return result;



}});









const browser=spawn('explorer.exe',[ui.loginUrl],{windowsHide:true,stdio:'ignore'});



browser.on('error',()=>process.stderr.write('Browser opening failed.\n'));browser.unref();



const startupStatus=autonomy.startupSnapshot();
fs.writeFileSync(resolve('artifacts/founder-integration-20261012/runtime-health.json'),JSON.stringify({startedAt:new Date().toISOString(),pid:process.pid,url:ui.url,mode:'private-founder',persistent:true,officeOrderFlow:startupStatus.officeOrderFlow,executionEnabled:true,executionScope:'public-research-private-analysis-readonly-reports',budget:startupStatus.budget}));



console.log('numaron Founder: '+ui.url);



process.send?.('ready');



for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{incomeClosing=true;clearInterval(incomeTimer);void ui.close().then(async()=>{await tradeRadar.close();await tradingEngine.close();await longHistory.close();historyStore.close();await autonomy.close();referenceAdministration?.close();operations.close();ledger.close();costImport.close();billing.close();tradeJournal.close();});});
