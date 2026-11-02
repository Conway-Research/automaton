import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDatabase } from "../state/database.js";
import { ResearchStore, type ResearchDossier } from "../revenue/research.js";

let dir: string, db: ReturnType<typeof createDatabase>, research: ResearchStore;
const now = Date.parse("2026-09-26T00:00:00Z");
function dossier(): ResearchDossier {
  return { opportunities: [{ id: "workflow", title: "Workflow pilot", sector: "b2b-services", hypothesis: "A paid pilot could reduce manual work",
    forecast: { revenueCents: 10000, costCents: 1000, probability: 0.5, days: 7, validationBudgetCents: 500 } }],
    evidence: ["one", "two"].map((id, i) => ({ id, opportunityId: "workflow", sourceUrl: `https://${id}.example/request`,
      observedAt: "2026-09-25T00:00:00Z", kind: "request", excerpt: `Synthetic test data representing a distinct request ${i}`,
      provenance: "reported", reviewedBy: "fixture-reviewer" })) };
}
function reviewFixture(data: ResearchDossier) {
  for (const e of data.evidence) if (e.provenance === 'reported' && e.reviewedBy)
    research.review(e.id, 'fixture operator', 'accept', 'Explicit local test review');
}
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "aureus-research-")); db = createDatabase(path.join(dir, "test.db")); research = new ResearchStore(db.raw); });
afterEach(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
describe("offline research and bounded validation proposals", () => {
  it('never treats reviewed method sources as customer demand or payment claims',()=>{
    const data=dossier();for(const e of data.evidence)e.kind='method';
    research.import(data);reviewFixture(data);
    expect(research.rank(now)[0]).toMatchObject({decision:'hold',independentSources:0});
    expect(research.outcomeLearning('workflow',now).paymentClaims).toEqual([]);
  });
  it('does not trust imported reviewer names and binds local reviews to unchanged evidence', () => {
    const data = dossier(); research.import(data);
    expect(research.rank(now)[0]).toMatchObject({decision:'hold',independentSources:0});
    reviewFixture(data);
    const other = createDatabase(path.join(dir,'test.db'));
    try {
      const second = new ResearchStore(other.raw);
      expect(second.rank(now)[0].decision).toBe('validate');
      second.review('one','another fixture operator','reject','Source is not relevant');
      expect(research.rank(now)[0].decision).toBe('hold');
      second.review('one','another fixture operator','accept','Rechecked source');
      other.raw.prepare("UPDATE research_evidence SET payload=replace(payload,'distinct request','modified request') WHERE id='one'").run();
      expect(research.rank(now)[0].decision).toBe('hold');
      expect(()=>second.review('one','operator','accept','Recheck')).toThrow('integrity');
      expect(research.plan(10000,now).plans).toHaveLength(0);
    } finally { other.close(); }
  });
  it("ranks reviewed demand, deducts validation costs, and never books claimed revenue", () => {
    const data = dossier(); data.evidence[0].kind = "payment_claim";
    research.import(data);
    reviewFixture(data);
    expect(research.rank(now)[0]).toMatchObject({ decision: "validate", independentSources: 2, forecastNetCents: 3500 });
    expect(research.plan(500, now)).toMatchObject({ allocatedCents: 500, plans: [{ opportunityId: "workflow", budgetCents: 500 }] });
    expect(research.plan(499, now).plans).toHaveLength(0);
    expect(db.raw.prepare("SELECT COUNT(*) n FROM economic_events").get()).toEqual({ n: 0 });
  });
  it("deduplicates imports, refuses silent revisions, and rolls back a whole bad import", () => {
    const data = dossier();
    expect(research.import(data)).toEqual({ opportunities: 1, evidence: 2 });
    expect(research.import(data)).toEqual({ opportunities: 0, evidence: 0 });
    data.opportunities[0].title = "Changed";
    expect(() => research.import(data)).toThrow(/immutable/);
    const other = dossier(); other.opportunities[0].id = "new"; other.evidence[0].sourceUrl = "file:///secret";
    expect(() => research.import(other)).toThrow();
    expect(research.rank(now)).toHaveLength(1);
  });
  it.each(["synthetic", "unreviewed", "stale", "future", "same-host", "cross-post"])("does not count %s evidence as independent fresh demand", variation => {
    const data = dossier();
    if (variation === "synthetic") data.evidence[0].provenance = "synthetic";
    if (variation === "unreviewed") data.evidence[0].reviewedBy = null;
    if (variation === "stale") data.evidence[0].observedAt = "2025-01-01T00:00:00Z";
    if (variation === "future") data.evidence[0].observedAt = "2027-01-01T00:00:00Z";
    if (variation === "same-host") data.evidence[0].sourceUrl = "https://two.example/other";
    if (variation === "cross-post") data.evidence[0].excerpt = data.evidence[1].excerpt;
    research.import(data); reviewFixture(data); expect(research.rank(now)[0].decision).toBe("hold");
    expect(research.plan(10000, now).plans).toHaveLength(0);
  });
  it("rejects negative expected return even with reported demand", () => {
    const data = dossier(); data.opportunities[0].forecast.costCents = 10000;
    research.import(data); reviewFixture(data); expect(research.rank(now)[0].decision).toBe("reject");
  });
  it("keeps aggregate proposal allocations within the available planning envelope", () => {
    const data = dossier(), extra = structuredClone(data.opportunities[0]); extra.id = "extra";
    data.opportunities.push(extra);
    data.evidence.push(...data.evidence.map(e => ({ ...e, id: `${e.id}-extra`, opportunityId: "extra" })));
    research.import(data); reviewFixture(data); expect(research.plan(999, now).allocatedCents).toBe(500);
    expect(research.plan(1000, now).allocatedCents).toBe(1000);
  });
  it("refuses credential-bearing URLs and executable input cannot run", () => {
    const data = dossier(); data.evidence[0].sourceUrl = "https://user:password@example.com/";
    expect(() => research.import(data)).toThrow(/credentials/);
    data.evidence[0].sourceUrl = "https://one.example/request";
    data.evidence[0].excerpt = "<script>throw new Error('not executable')</script>";
    expect(() => research.import(data)).not.toThrow();
  });
});
