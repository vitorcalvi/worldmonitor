import test from 'node:test';
import assert from 'node:assert/strict';
import {createSelfhostedAnalyst} from '../server/selfhosted-analyst.mjs';
const env={LLM_API_URL:'http://192.168.1.45:4000/v1/chat/completions',LLM_API_KEY:'test-only-local-key',LLM_MODEL:'local-model'};
const sources=[{title:'Shipping advisory',url:'https://example.org/advisory',observedAt:'2026-10-21T09:00:00Z',excerpt:'Shipping was rerouted around a strait.'}];
const fake=(answer,inspect)=>async(url,options)=>{
  if(inspect)inspect(url,options);
  return {ok:true,status:200,json:async()=>({choices:[{message:{content:answer}}]})};
};
test('requires server-side credentials',()=>{
  assert.throws(()=>createSelfhostedAnalyst({env:{}}),/server-only/);
  assert.throws(()=>createSelfhostedAnalyst({env:{...env,LLM_API_URL:'http://evil.example.com/v1'}}),/private network/);
});
test('runs an operator-configured LLM with attributed evidence and retains correct citations',async()=>{
  let called=false;
  const analyst=createSelfhostedAnalyst({env,fetchImpl:fake('The report describes a reroute [S1].',(url,opts)=>{
    called=true;
    assert.equal(url,env.LLM_API_URL);
    assert.equal(opts.headers.Authorization,'Bearer '+env.LLM_API_KEY);
    const payload=JSON.parse(opts.body);
    assert.equal(payload.model,env.LLM_MODEL);
    assert.match(payload.messages[1].content,/Shipping was rerouted/);
    assert.doesNotMatch(payload.messages[1].content,/test-only-local-key/);
  })});
  const answer=await analyst.ask({question:'What changed near the strait?',sources});
  assert.ok(called);
  assert.equal(answer.citations.length,1);
  assert.equal(answer.citations[0].url,sources[0].url);
  assert.equal(answer.sourceCount,1);
  assert.ok(!JSON.stringify(answer).includes(env.LLM_API_KEY));
});
test('rejects invalid source URL or unsupported question',async()=>{
  const analyst=createSelfhostedAnalyst({env,fetchImpl:fake('Text [S1]')});
  await assert.rejects(analyst.ask({question:'x',sources}),/Question too short/);
  await assert.rejects(analyst.ask({question:'Explain the report',sources:[{...sources[0],url:'http://example.org'}]}),/HTTPS/);
});
test('fails closed on fabricated source citations',async()=>{
  const analyst=createSelfhostedAnalyst({env,fetchImpl:fake('Unsupported evidence [S9]')});
  await assert.rejects(analyst.ask({question:'Explain the report',sources}),/missing source/);
});
test('fails closed on responses without citations',async()=>{
  const analyst=createSelfhostedAnalyst({env,fetchImpl:fake('Unsupported claim')});
  await assert.rejects(analyst.ask({question:'Explain the report',sources}),/omitted required citations/);
});
test('fails without leaking provider response details',async()=>{
  const analyst=createSelfhostedAnalyst({env,fetchImpl:async()=>({ok:false,status:429})});
  await assert.rejects(analyst.ask({question:'Explain the report',sources}),/HTTP 429/);
});
