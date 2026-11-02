import {it,expect} from 'vitest';
import {verifyPersonalCycle} from '../v1/personal-verification.js';
it('checks the 50 CHF personal cycle with shared holds, restart and a 10 CHF spending ceiling',async()=>{
 const report=await verifyPersonalCycle();
 expect(report).toMatchObject({mode:'simulation-only',currency:'USD',startingCapitalChfCents:5000,exchangeRate:{chfPerUsd:1},recoveredJobs:2,connections:2,realProviderCalls:0,realOrders:0});
 expect(report.totals.spentCents+report.totals.reservedCents).toBeLessThanOrEqual(1000);
 expect(report.totals.liquidCents).toBeGreaterThanOrEqual(4000);
 // This deliberately crowded baseline exposes fragmentation before monetization.
 expect(report.completed).toBe(0);
 expect(report.totals.revenueCents).toBe(0);
 expect(report.stopped).toBeGreaterThan(0);
 expect(report.pending).toBeGreaterThan(0);
});
