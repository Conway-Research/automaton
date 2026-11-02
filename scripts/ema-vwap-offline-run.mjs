import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { backtest, syntheticBars } from './lib/ema-vwap-offline.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'outputs','ema-vwap-offline-20261019');
const powerFile=path.join(root,'artifacts/founder-integration-20261012/power-state.jsonl');
function power(){const p=JSON.parse(fs.readFileSync(powerFile,'utf8').trim().split(/\r?\n/).at(-1));return {enabled:p.enabled,revision:p.revision};}
const before=power();if(before.enabled!==false)throw Error('Expected OFF; no power mutation attempted');
const results=[];
for(const regime of ['trend','chop','mixed'])for(const seed of [7,19,41]) {
  const bars=syntheticBars(seed,20,regime);
  const digest=createHash('sha256').update(JSON.stringify(bars)).digest('hex');
  for(const variant of ['cross','early'])for(const [costCase,costs] of Object.entries({
    baseline:{feeBps:10,spreadBps:4,slippageBps:3},stress:{feeBps:20,spreadBps:8,slippageBps:6}
  })) {
    const r=backtest(bars,variant,costs);
    results.push({regime,seed,bars:bars.length,digest,costCase,...r});
  }
}
const after=power();if(after.enabled!==false)throw Error('Power changed externally during offline run');
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({schema:'ema-vwap-offline-v1',createdAt:new Date().toISOString(),
  provenance:'synthetic-only; no historical market data',powerBefore:before,powerAfter:after,
  productionChanged:false,networkCalls:false,liveAuthorized:false,results},null,2));
const lines=['# EMA 9 / VWAP — Offline-Versuch', '',
  'Beide Varianten implementiert. Ausschließlich deterministische synthetische Daten, keine Aussage über reale Profitabilität.',
  '20 Sitzungen mit je 78 Fünf-Minuten-Kerzen pro Datensatz, drei Regime und drei feste Seeds. Kein Optimieren der Parameter. Alle Szenarien sind Entwicklungstests, kein unabhängiger Holdout.',
  '', 'EMA: Schlusskurs, SMA der ersten 9 Kerzen als Start, danach alpha=0.2; über Sitzungen fortgeführt. VWAP: kumulierter typischer Preis (H+L+C)/3 mal Volumen, Reset pro expliziter Sitzung.',
  'Cross: bestätigtes Kreuz plus Schlusskurs über beiden Linien und vorherigem Hoch (Long), spiegelbildlich Short. Early: Abstand maximal 10 bp, Annäherung ohne Kreuz, EMA steigt/fällt, Schlusskurs bricht vorheriges Hoch/Tief.',
  'Einstieg nächste Eröffnung, nur gleiche Sitzung. Stop am Signalkerzenextrem, Ziel 1.5R ab ausgeführtem Einstieg. Ungültiger Stop durch Eröffnungslücke: kein Trade. Gegenkreuz ohne Ausbruchsfilter: Ausstieg nächste Eröffnung. Sitzungsschluss: Glattstellung. Stop und Ziel in gleicher Kerze: Stop zuerst. Stop-Lücken: Eröffnungskurs.',
  'Eine Position, konstante Menge 1, kein Hebel oder Kapitalbudget. Zahlen in synthetischen Preiseinheiten. Drawdown nur auf geschlossenen Trades, kein Intrabar-Drawdown. Keine Finanzierung, Leihkosten, Steuern, Liquiditäts- oder Teilfüllungsmodelle.',
  'Baseline je Seite: 10 bp Gebühr + 2 bp halber Spread + 3 bp Slippage; Stress jeweils doppelt. Gebühren auf ausgeführtem Ein- und Ausstiegswert. Preisaufschläge beim Kauf, Abschläge beim Verkauf. Annahmen sind keine Brokerkonditionen.', '',
  '| Variante | Kosten | Trades | Brutto | Kostenbetrag | Netto |', '|---|---|---:|---:|---:|---:|'];
for(const variant of ['cross','early'])for(const costCase of ['baseline','stress']) {
  const rows=results.filter(r=>r.variant===variant&&r.costCase===costCase);
  const sum=k=>rows.reduce((a,r)=>a+r[k],0);
  lines.push(`| ${variant} | ${costCase} | ${rows.reduce((a,r)=>a+r.trades.length,0)} | ${sum('gross').toFixed(4)} | ${sum('cost').toFixed(4)} | ${sum('net').toFixed(4)} |`);
}
lines.push('', 'Ergebnisse über neun getrennte synthetische Szenarien addiert; kein handelbares Portfolio. Vollständige Trades und Datensatz-Hashes in results.json.',
  `Power vorher/nachher: OFF, Revision ${before.revision}/${after.revision}. Kein Produktionsimport, Neustart oder Provideraufruf.`,
  'Reproduktion: node --test scripts/ema-vwap-offline.test.mjs und node scripts/ema-vwap-offline-run.mjs',
  'Vor realer Bewertung fehlen unabhängig geprüfte historische Fünf-Minuten-OHLCV-Daten, instrumentspezifische Handelszeiten und tatsächliche Ausführungskosten. Die Offline-Implementierung ist nicht an den Live-Controller angeschlossen.');
fs.writeFileSync(path.join(out,'bericht.md'),lines.join('\n')+'\n');
console.log(lines.slice(lines.indexOf('| Variante | Kosten | Trades | Brutto | Kostenbetrag | Netto |')).join('\n'));
