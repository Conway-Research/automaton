import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {backtest} from './lib/ema-vwap-offline.mjs';
import {parseFiveMinuteCsv,summarizeHistory} from './lib/ema-vwap-history.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'outputs/ema-vwap-historical-20261019');
if(fs.existsSync(path.join(output,'results.json')))throw Error('Results already exist; preserve original run');
const power=()=>{const p=JSON.parse(fs.readFileSync(path.join(root,'artifacts/founder-integration-20261012/power-state.jsonl'),'utf8').trim().split(/\r?\n/).at(-1));return {enabled:p.enabled,revision:p.revision};};
const before=power();if(before.enabled!==false)throw Error('OFF required; no change attempted');
const source=path.join(root,'artifacts/intraday-study-20261009');
const manifest=JSON.parse(fs.readFileSync(path.join(source,'source-manifest.json'),'utf8'));
const sha=data=>createHash('sha256').update(data).digest('hex');
const archiveSha256=sha(fs.readFileSync(path.join(source,'ETHUSDT-5m-2026-09.zip')));
if(archiveSha256!==manifest.sha256)throw Error('Archive changed since historical acquisition');
const raw=fs.readFileSync(path.join(source,'historical.csv'),'utf8');
const bars=parseFiveMinuteCsv(raw,Date.UTC(2026,8,1),Date.UTC(2026,9,1));
fs.mkdirSync(output,{recursive:true});
const protocol={registeredAt:new Date().toISOString(),symbol:'ETHUSDT',venue:'Binance spot',
  source:manifest,archiveSha256,csvSha256:sha(raw),rows:bars.length,
  session:'UTC day 00:00-24:00',quantity:1,quantityUnit:'ETH',quoteCurrency:'USDT',
  rules:'Frozen prior EMA9 cross / early within 10 bp; next open; stop signal extreme; target 1.5R; same-session flatten; stop first if ambiguous',
  vwap:'bar typical-price volume-weighted approximation; not exact trade-by-trade VWAP',
  parametersOptimized:false,independentHoldout:false,
  dataReuse:'Previously used in another intraday study, not an unseen dataset. First/second half are descriptive calendar splits.',
  feeSource:'https://www.binance.com/en/fee/trading',feeCheckedAt:'2026-10-19',
  feeStatus:'Public standard 0.100% per side, no BNB/VIP discount; not authenticated or verified September account tariff',
  executionStatus:'OHLCV lacks quotes, depth and fills. Spread/slippage below are explicit plausible sensitivity assumptions, not measured historical costs.',
  shortStatus:'Spot cannot open naked shorts. Short signals are hypothetical margin diagnostics; borrow availability and actual rates unverified. Not a futures backtest.',
  shortBorrowBpsPerHour:1,shortBorrowStatus:'Stress allowance only: 0.01% per started hour, not a venue quote; charged in simplified quote equivalent at entry',
  costScenarios:{low:{feeBps:10,spreadBps:1,slippageBps:1},base:{feeBps:10,spreadBps:4,slippageBps:3},stress:{feeBps:10,spreadBps:10,slippageBps:10}},
  noNetworkInRunner:true,liveAuthorized:false};
// Persist the cost protocol BEFORE evaluating historical strategy results.
fs.writeFileSync(path.join(output,'protocol.json'),JSON.stringify(protocol,null,2));
const results=[];
for(const variant of ['cross','early'])for(const [scenario,costs] of Object.entries(protocol.costScenarios)) {
  const run=backtest(bars,variant,costs);
  const stats=summarizeHistory(run.trades,bars,protocol.shortBorrowBpsPerHour);
  const split=Date.UTC(2026,8,16);
  const byHalf={first:summarizeHistory(run.trades.filter(t=>bars[t.entryIndex].time<split),bars,1),
    second:summarizeHistory(run.trades.filter(t=>bars[t.entryIndex].time>=split),bars,1)};
  const trades=run.trades.map(t=>({...t,signalAt:new Date(bars[t.signalIndex].time+300000).toISOString(),
    entryAt:new Date(bars[t.entryIndex].time).toISOString(),
    exitBarStart:new Date(bars[t.exitIndex].time).toISOString()}));
  results.push({variant,scenario,costs,stats,byHalf,trades});
}
const after=power();if(after.enabled!==false||after.revision!==before.revision)throw Error('Power changed externally');
const result={schema:'ema-vwap-historical-v1',protocol,results,powerBefore:before,powerAfter:after,
  productionWrites:false,marketDataDownloads:false,networkCallsInRunner:false};
fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(result,null,2));
const text=['# EMA 9 / VWAP: echter historischer Offline-Test','',
  'ETH/USDT, Binance Spot, 01.–30. September 2026, 8.640 lückenlose 5-Minuten-Kerzen mit echtem Basis- und Quote-Handelsvolumen. Lokales, bereits am 9. Oktober bezogenes Archiv; kein neuer Download.',
  `Archiv SHA256: ${archiveSha256}. Damaliges Manifest verzeichnet Abgleich mit Anbieter-Checksumme; aktueller lokaler Hash stimmt überein. CSV zusätzlich gegen Inhalt des Archivs prüfen (siehe verification.json).`,
  'Quelle: '+manifest.url,'',
  'Regeln unverändert gegenüber dem synthetischen Versuch. EMA9 über Sitzungen fortgeführt; Session-VWAP täglich 00:00 UTC zurückgesetzt. VWAP aus typischen Kerzenpreisen und Basisvolumen ist eine Approximation. Keine nachträgliche Parameteroptimierung.',
  'Menge konstant 1 ETH, kein Hebel, kein echtes Budget. Ergebnisse in USDT; Summen sind keine Rendite auf ein definiertes Konto. Geschlossener Drawdown, kein Intrabar- oder Kontomargin-Drawdown.',
  'Öffentliche Standard-Handelsgebühr: 0,10% je Seite, keine Rabatte. Heute geprüft, historischer persönlicher Tarif unbestätigt: https://www.binance.com/en/fee/trading',
  'Spread gesamt / Slippage je Seite: niedrig 1/1 bp, Basis 4/3 bp, Stress 10/10 bp. Keine Quote-/Orderbuchhistorie vorhanden: Annahmen und Sensitivitäten, keine gemessenen Ausführungskosten.',
  'Shorts auf Spot sind nicht direkt ausführbar. Separat ausgewiesene hypothetische Margin-Shorts mit zusätzlichem Kostenpuffer von 1 bp pro angefangener Stunde, mindestens eine Stunde. Tatsächliche Leihbarkeit, Zinsen, Marginregeln und Liquidationen fehlen. Keine Aussage über Futures-Ausführung.',
  'Brutto und ausgeführte Tradeanzahl können sich mit Kosten ändern: Kosten verändern Einstieg und damit 1,5R-Ziel sowie Haltezeiten. Long/Short-Zeilen sind Aufteilungen desselben Laufes mit nur einer gleichzeitigen Position, keine separat neu simulierten Long-only/Short-only-Strategien.',
  'Archiv bereits in früherer Forschung verwendet: kein unabhängig unberührter Holdout. Kalenderhälften werden nur beschreibend ausgewiesen. Ein Monat und ein Instrument reichen nicht zur Robustheitsbestätigung.', '',
  '| Variante | Szenario | Richtung | Trades | Brutto USDT | Ausführungskosten | Leihpuffer | Netto USDT | Trefferquote | Profitfaktor |',
  '|---|---|---|---:|---:|---:|---:|---:|---:|---:|'];
for(const r of results)for(const side of ['all','long','short']) {
  const s=r.stats[side];text.push(`| ${r.variant} | ${r.scenario} | ${side} | ${s.trades} | ${s.gross.toFixed(2)} | ${s.executionCosts.toFixed(2)} | ${s.borrow.toFixed(2)} | ${s.net.toFixed(2)} | ${(100*s.winRate).toFixed(1)}% | ${s.profitFactor?.toFixed(3)??'n/a'} |`);
}
text.push('',`Power vorher/nachher OFF, Revision ${before.revision}/${after.revision}. Keine Produktionsänderung oder Aktivierung.`,
  'Alle Einzeltrades, Tageszeit- und Richtungszuordnung sowie Ergebnisse je Monatshälfte in results.json. Signalzeit bezeichnet Kerzenschluss, Exitzeit bei Stop/Ziel nur Kerzenbeginn als Zeitintervallbezeichnung, kein bekannter Intrabar-Zeitpunkt.',
  'Datenattribution: Binance Public Data / Binance Vision; Archiv laut lokalem Erwerbsprotokoll CC BY-NC-SA 4.0, persönliche nichtkommerzielle Offline-Forschung. Abgeleitete Berichtsdaten unter derselben Lizenz: https://creativecommons.org/licenses/by-nc-sa/4.0/',
  'Reproduktion: node --test scripts/ema-vwap-offline.test.mjs scripts/ema-vwap-history.test.mjs; node scripts/ema-vwap-history-run.mjs (bestehende Ergebnisse werden nicht überschrieben).');
fs.writeFileSync(path.join(output,'bericht.md'),text.join('\n')+'\n');
console.log(text.slice(text.findIndex(x=>x.startsWith('| Variante'))).join('\n'));
