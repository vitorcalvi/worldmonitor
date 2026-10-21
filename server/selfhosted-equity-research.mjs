/**
 * Independent BYOD (bring-your-own-data) equity analytics for a self-hosted
 * AGPL WorldMonitor fork. No hosted premium API, market-data redistribution,
 * trade recommendations, or implied real-time pricing.
 */
function finite(name,v,{zero=false}={}) {
  if(typeof v!=='number'||!Number.isFinite(v)||(!zero&&v<=0)) throw new TypeError(name+' must be a finite '+(zero?'number':'positive number'));
  return v;
}
const round=x=>Number.isFinite(x)?Number(x.toFixed(6)):null;
function provenance(source) {
  if(!source||typeof source!=='object')throw new TypeError('source required');
  let u;try{u=new URL(source.url)}catch{throw new TypeError('source URL must be HTTPS')}
  if(u.protocol!=='https:'||u.username||u.password)throw new TypeError('source URL must be HTTPS');
  const observedAt=new Date(source.observedAt);
  if(!Number.isFinite(observedAt.getTime()))throw new TypeError('source.observedAt invalid');
  return {name:String(source.name??'').slice(0,120),url:u.href,observedAt:observedAt.toISOString()};
}
export function normalizePriceBars(raw){
  if(!Array.isArray(raw)||raw.length===0||raw.length>2000)throw new TypeError('Provide 1..2000 price bars');
  const sorted=raw.map((bar,i)=>{
    const day=new Date(bar.date);
    if(!Number.isFinite(day.valueOf()))throw new TypeError('Invalid bar date at '+i);
    const close=finite('bar.close',bar.close);
    const volume=finite('bar.volume',bar.volume,{zero:true});
    if(volume<0)throw new TypeError('Negative volume');
    return {date:day.toISOString().slice(0,10),close,volume};
  }).sort((a,b)=>a.date.localeCompare(b.date));
  for(let i=1;i<sorted.length;i++)if(sorted[i].date===sorted[i-1].date)throw new TypeError('Duplicate price bar date');
  return sorted;
}
const dailyReturns=bars=>bars.slice(1).map((b,i)=>({date:b.date,value:b.close/bars[i].close-1}));
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
function statistics(values){
  if(values.length<2)return {mean:null,standardDeviation:null};
  const avg=mean(values), variance=values.reduce((s,v)=>s+(v-avg)**2,0)/(values.length-1);
  return {mean:round(avg),standardDeviation:round(Math.sqrt(variance))};
}
function drawdown(bars){
  let peak=0,max=0;
  for(const bar of bars){peak=Math.max(peak,bar.close);max=Math.max(max,1-bar.close/peak);}
  return round(max*100);
}
function betaAgainst(symbolBars,benchmarkBars){
  if(!benchmarkBars)return {beta:null,alignedReturns:0};
  const benchmark=new Map(dailyReturns(benchmarkBars).map(x=>[x.date,x.value]));
  const paired=dailyReturns(symbolBars).filter(x=>benchmark.has(x.date)).map(x=>[x.value,benchmark.get(x.date)]);
  if(paired.length<3)return {beta:null,alignedReturns:paired.length};
  const x=paired.map(v=>v[0]),y=paired.map(v=>v[1]),mx=mean(x),my=mean(y);
  const varY=y.reduce((s,v)=>s+(v-my)**2,0);
  return {beta:varY===0?null:round(paired.reduce((s,v)=>s+(v[0]-mx)*(v[1]-my),0)/varY),alignedReturns:paired.length};
}
export function analyzeEquity({symbol,bars,benchmarkBars,fundamentals,analystTargets,source}){
  if(typeof symbol!=='string'||!/^[A-Z0-9.^_-]{1,20}$/i.test(symbol))throw new TypeError('Invalid ticker');
  const origin=provenance(source),prices=normalizePriceBars(bars);
  const benchmark=benchmarkBars===undefined?null:normalizePriceBars(benchmarkBars);
  const current=prices.at(-1).close,first=prices[0].close;
  const returns=dailyReturns(prices).map(v=>v.value);
  const vol=statistics(returns);
  const window20=prices.slice(-20);
  const totalVolume=window20.reduce((s,b)=>s+b.volume,0);
  const dollarVolume=window20.reduce((s,b)=>s+b.volume*b.close,0);
  const result={
    symbol:symbol.toUpperCase(),source:origin,asOf:prices.at(-1).date,bars:prices.length,
    price:current,returnSinceStartPct:round((current/first-1)*100),
    returnLastBarPct:prices.length>1?round((current/prices.at(-2).close-1)*100):null,
    trailing20BarReturnPct:prices.length>20?round((current/prices.at(-21).close-1)*100):null,
    annualizedDailyVolatilityPct:vol.standardDeviation===null?null:round(vol.standardDeviation*Math.sqrt(252)*100),
    maximumObservedDrawdownPct:drawdown(prices),
    average20BarVolume:round(totalVolume/window20.length),
    average20BarDollarVolume:round(dollarVolume/window20.length),
    ...betaAgainst(prices,benchmark),
    valuation:null,analystTargetSummary:null
  };
  if(fundamentals!==undefined){
    if(!fundamentals||typeof fundamentals!=='object')throw new TypeError('Invalid fundamentals');
    const shares=finite('sharesOutstanding',fundamentals.sharesOutstanding);
    const cap=current*shares;
    const eps=fundamentals.epsTtm;
    const revenue=fundamentals.revenueTtm;
    const debt=fundamentals.netDebt??0;
    finite('netDebt',debt,{zero:true});
    const ebitda=fundamentals.ebitdaTtm;
    if(eps!==undefined)finite('epsTtm',eps,{zero:true});
    if(revenue!==undefined)finite('revenueTtm',revenue,{zero:true});
    if(ebitda!==undefined)finite('ebitdaTtm',ebitda,{zero:true});
    result.valuation={
      marketCap:round(cap),
      enterpriseValue:round(cap+debt),
      priceToEarnings:eps>0?round(current/eps):null,
      priceToSales:revenue>0?round(cap/revenue):null,
      enterpriseValueToEbitda:ebitda>0?round((cap+debt)/ebitda):null,
      negativeEarnings:eps!==undefined?eps<=0:null
    };
  }
  if(analystTargets!==undefined){
    if(!Array.isArray(analystTargets)||analystTargets.length>100)throw new TypeError('Invalid target list');
    const values=analystTargets.map(v=>finite('analyst target',v));
    if(values.length){
      const sorted=[...values].sort((a,b)=>a-b);
      const middle=Math.floor(sorted.length/2);
      const median=sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
      result.analystTargetSummary={count:values.length,median:round(median),min:sorted[0],max:sorted.at(-1),medianUpsidePct:round((median/current-1)*100)};
    }
  }
  return result;
}
