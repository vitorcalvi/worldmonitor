/**
 * Standalone BYOK analyst adapter for an AGPL WorldMonitor derivative.
 * No hosted Pro calls, no bypass of licensing or paid entitlements.
 * Must be invoked behind application-owned authentication/rate limiting.
 */
const clamp=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
function config(env){
  const key=clamp(env.LLM_API_KEY,500),model=clamp(env.LLM_MODEL,120),base=clamp(env.LLM_API_URL,1000);
  if(!key||!model||!base)throw new Error('Missing server-only LLM_API_URL/LLM_API_KEY/LLM_MODEL');
  let url;try{url=new URL(base)}catch{throw new TypeError('Invalid configured LLM endpoint')}
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new TypeError('Invalid configured LLM endpoint');
  // The operator controls this URL in server env. Do not accept provider URLs from users.
  if(url.protocol==='http:'&&!/^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/i.test(url.hostname))throw new TypeError('HTTP inference limited to operator private network');
  return {url:url.href,key,model};
}
function normalizeSources(items){
  if(!Array.isArray(items)||items.length<1||items.length>16)throw new TypeError('1..16 sources required');
  const sources=items.map((s,index)=>{
    if(!s||typeof s!=='object')throw new TypeError('Invalid source');
    const title=clamp(s.title,200),excerpt=clamp(s.excerpt,2500);
    if(!title||!excerpt)throw new TypeError('Each source needs title and excerpt');
    let url;try{url=new URL(s.url)}catch{throw new TypeError('Source URL must be HTTPS')}
    if(url.protocol!=='https:'||url.username||url.password)throw new TypeError('Source URL must be HTTPS');
    const seen=new Date(s.observedAt);
    if(!Number.isFinite(seen.valueOf()))throw new TypeError('Source timestamp required');
    return {id:'S'+(index+1),title,url:url.href,observedAt:seen.toISOString(),excerpt};
  });
  return sources;
}
export function createSelfhostedAnalyst({env=process.env,fetchImpl=fetch,timeoutMs=25000}={}){
  const provider=config(env);
  if(typeof fetchImpl!=='function')throw new TypeError('Invalid fetch adapter');
  if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>120000)throw new RangeError('Invalid timeout');
  return {
    async ask({question,sources}){
      const query=clamp(question,1600);
      if(query.length<3)throw new TypeError('Question too short');
      const evidence=normalizeSources(sources);
      const context=evidence.map(s=>JSON.stringify(s)).join('\n');
      const system='You are a cautious geopolitical and financial research assistant. Use only the provided source excerpts. Cite each factual claim with the corresponding [S1] notation. If the excerpts do not support an answer, state clearly that evidence is insufficient. Never invent sources, prices, dates, quotations, or recommendations. Clearly distinguish inference from observed information.';
      const payload={
        model:provider.model,temperature:0,max_tokens:900,
        messages:[{role:'system',content:system},{role:'user',content:'QUESTION:\n'+query+'\n\nATTRIBUTED EVIDENCE:\n'+context}]
      };
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),timeoutMs);
      let response;
      try{
        response=await fetchImpl(provider.url,{method:'POST',headers:{Authorization:'Bearer '+provider.key,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
      }finally{clearTimeout(timer)}
      if(!response?.ok)throw new Error('Inference provider failed (HTTP '+(response?.status??'unknown')+')');
      const output=await response.json();
      const answer=clamp(output?.choices?.[0]?.message?.content,12000);
      if(!answer)throw new Error('Inference provider returned no answer');
      const citations=[...new Set([...answer.matchAll(/\[(S\d{1,2})\]/g)].map(match=>match[1]))];
      if(citations.length===0)throw new Error('Analyst response omitted required citations');
      if(citations.some(id=>!evidence.some(s=>s.id===id)))throw new Error('Analyst response cited a missing source');
      const cited=evidence.filter(s=>citations.includes(s.id)).map(({excerpt,...meta})=>meta);
      return {answer,citations:cited,model:provider.model,sourceCount:evidence.length,disclaimer:'Generated synthesis of provided sources; not independent verification or investment advice.'};
    }
  };
}
