import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SelfhostedIntelMemory,loadIntelMemory,saveIntelMemory} from '../server/selfhosted-intel-memory.mjs';
const now=Date.parse('2026-10-21T12:00:00Z');
const data=(id,extra={})=>({id,title:'Red Sea shipping disruption',summary:'Chokepoint route disrupted',source:'Example Data',sourceUrl:'https://example.org/ship',occurredAt:'2026-10-20T00:00:00Z',countries:['YE'],tags:['SHIPPING'],severity:4,...extra});
test('validates sourced records including URL/severity',()=>{
  const store=new SelfhostedIntelMemory({now:()=>now});
  assert.throws(()=>store.ingest([data('x',{sourceUrl:'http://example.org'})]),/HTTPS/);
  assert.throws(()=>store.ingest([data('x',{sourceUrl:'https://me:pass@example.org'})]),/HTTPS/);
  assert.throws(()=>store.ingest([data('x',{severity:6})]),/severity/);
  assert.equal(store.size,0);
});
test('deduplicates events and replaces updated records',()=>{
  const memory=new SelfhostedIntelMemory({now:()=>now});
  assert.deepEqual(memory.ingest([data('a')]),{inserted:1,updated:0,retained:1});
  assert.deepEqual(memory.ingest([data('a',{severity:5})]),{inserted:0,updated:1,retained:1});
  assert.equal(memory.get('a')?.severity,5);
});
test('validates an entire ingest batch atomically',()=>{
  const memory=new SelfhostedIntelMemory({now:()=>now});
  assert.throws(()=>memory.ingest([data('valid'),data('invalid',{title:''})]));
  assert.equal(memory.size,0);
});
test('supports sourced timelines and search filters without mutable references',()=>{
  const memory=new SelfhostedIntelMemory({now:()=>now});
  memory.ingest([data('old',{occurredAt:'2026-10-18T00:00:00Z'}),data('recent'),data('other',{countries:['US'],tags:['TECH'],title:'Other technical event'})]);
  const hits=memory.search({query:'shipping',countries:['YE'],minSeverity:4});
  assert.deepEqual(hits.map(x=>x.id),['recent','old']);
  hits[0].title='Changed';
  assert.equal(memory.get('recent').title,'Red Sea shipping disruption');
});
test('returns ranked related events but not the seed event',()=>{
  const memory=new SelfhostedIntelMemory({now:()=>now});
  memory.ingest([data('a'),data('b',{sourceUrl:'https://example.org/other'}),data('c',{title:'Solar flare',summary:'Space weather',countries:['US'],tags:['SPACE']})]);
  const related=memory.similar('a');
  assert.equal(related[0].id,'b');
  assert.ok(related[0].similarity>.7);
  assert.ok(!related.some(e=>e.id==='a'));
});
test('prunes old entries and enforces maxEntries',()=>{
  const memory=new SelfhostedIntelMemory({now:()=>now,maxEntries:1,maxAgeMs:7*86400000});
  memory.ingest([data('expired',{occurredAt:'2026-09-01T00:00:00Z'}),data('newer'),data('older',{occurredAt:'2026-10-19T00:00:00Z'})]);
  assert.equal(memory.size,1);assert.equal(memory.get('newer').id,'newer');
});
test('persists snapshots atomically and in private mode',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'wm-intel-'));
  try{
    const file=join(dir,'memory.json');
    const memory=new SelfhostedIntelMemory({now:()=>now});memory.ingest([data('stored')]);
    await saveIntelMemory(memory,file);
    assert.equal((await stat(file)).mode&0o777,0o600);
    const loaded=await loadIntelMemory(file,{now:()=>now});
    assert.equal(loaded.get('stored').sourceUrl,'https://example.org/ship');
  }finally{await rm(dir,{recursive:true,force:true})}
});
