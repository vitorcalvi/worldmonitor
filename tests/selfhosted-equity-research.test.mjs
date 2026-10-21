import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeEquity,normalizePriceBars} from '../server/selfhosted-equity-research.mjs';
const bars=[100,103,101,105,106,108].map((close,i)=>({date:'2026-10-'+String(i+1).padStart(2,'0'),close,volume:1_000_000+i*1000}));
const source={name:'Own market-data feed',url:'https://example.org/data',observedAt:'2026-10-21T12:00:00Z'};
const analyze=extra=>analyzeEquity({symbol:'XYZ',bars,source,...extra});
test('rejects missing provenance, non-HTTPS and invalid prices',()=>{
  assert.throws(()=>analyzeEquity({symbol:'XYZ',bars,source:{...source,url:'http://x.test'}}),/HTTPS/);
  assert.throws(()=>normalizePriceBars([{date:'2026-10-01',close:-1,volume:1}]),/positive/);
  assert.throws(()=>normalizePriceBars([bars[0],bars[0]]),/Duplicate/);
});
test('computes real observed return, drawdown, dollar-volume and volatility',()=>{
  const r=analyze();
  assert.equal(r.price,108);
  assert.equal(r.returnSinceStartPct,8);
  assert.equal(r.returnLastBarPct,Number(((108/106-1)*100).toFixed(6)));
  assert.equal(r.bars,6);
  assert.ok(r.maximumObservedDrawdownPct>0);
  assert.ok(r.annualizedDailyVolatilityPct>0);
  assert.ok(r.average20BarDollarVolume>1e8);
  assert.equal(r.source.url,source.url);
});
test('matches benchmark returns by date to calculate beta',()=>{
  const benchmarkBars=bars.map((b,i)=>({...b,close:200+i*3}));
  const r=analyze({benchmarkBars});
  assert.equal(r.alignedReturns,5);
  assert.ok(Number.isFinite(r.beta));
});
test('returns null when beta has insufficient aligned dates',()=>{
  const benchmarkBars=bars.slice(-2);
  const r=analyze({benchmarkBars});
  assert.equal(r.alignedReturns,1);
  assert.equal(r.beta,null);
});
test('valuation ratios depend on supplied fundamentals and avoid negative earnings P/E',()=>{
  const r=analyze({fundamentals:{sharesOutstanding:1_000_000,epsTtm:-2,revenueTtm:50_000_000,netDebt:10_000_000,ebitdaTtm:7_000_000}});
  assert.equal(r.valuation.marketCap,108_000_000);
  assert.equal(r.valuation.enterpriseValue,118_000_000);
  assert.equal(r.valuation.priceToEarnings,null);
  assert.equal(r.valuation.priceToSales,2.16);
  assert.equal(r.valuation.negativeEarnings,true);
});
test('analyst targets provide descriptive summary, not a recommendation',()=>{
  const r=analyze({analystTargets:[120,100,140,110]});
  assert.equal(r.analystTargetSummary.count,4);
  assert.equal(r.analystTargetSummary.median,115);
  assert.ok(r.analystTargetSummary.medianUpsidePct>0);
  assert.equal(analyze().analystTargetSummary,null);
});
test('single observation leaves unavailable risk metrics null',()=>{
  const r=analyze({bars:[bars[0]]});
  assert.equal(r.annualizedDailyVolatilityPct,null);
  assert.equal(r.returnLastBarPct,null);
  assert.equal(r.beta,null);
});
