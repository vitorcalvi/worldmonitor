/**
 * Local, sourced event memory for a modified AGPL WorldMonitor deployment.
 * No WorldMonitor hosted Pro data, credential sharing, or entitlement changes.
 */
import {createHash, randomUUID} from 'node:crypto';
import {readFile, writeFile, rename, unlink} from 'node:fs/promises';
import {dirname, basename, join} from 'node:path';

const tokens=s=>new Set((String(s??'').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu)??[]).slice(0,1000));
const set=(x,re)=>Array.isArray(x)?[...new Set(x.map(y=>String(y).trim().toUpperCase()).filter(y=>re.test(y)))].slice(0,30):[];
const clean=s=>typeof s==='string'?s.replace(/[\u0000-\u001f]/g,'').trim():'';
function normalize(raw) {
  if (!raw||typeof raw!=='object'||Array.isArray(raw))throw new TypeError('Event must be an object');
  const title=clean(raw.title).slice(0,300), source=clean(raw.source).slice(0,150);
  const summary=clean(raw.summary).slice(0,4000);
  if(!title||!source)throw new TypeError('title and source required');
  let url;try{url=new URL(raw.sourceUrl)}catch{throw new TypeError('sourceUrl must be HTTPS')}
  if(url.protocol!=='https:'||url.username||url.password||url.hostname==='localhost')throw new TypeError('sourceUrl must be HTTPS without credentials');
  const timestamp=Date.parse(raw.occurredAt);
  if(!Number.isFinite(timestamp))throw new TypeError('occurredAt must be a valid date');
  const severity=Number(raw.severity??0);
  if(!Number.isInteger(severity)||severity<0||severity>5)throw new RangeError('severity 0..5');
  const countries=set(raw.countries,/^[A-Z]{2}$/), tags=set(raw.tags,/^[A-Z0-9][A-Z0-9 _-]{0,39}$/);
  const providedId=clean(raw.id);
  if(providedId&&!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(providedId))throw new TypeError('Invalid event ID');
  const id=providedId||createHash('sha256').update([source,url.href,title,new Date(timestamp).toISOString()].join('|')).digest('hex').slice(0,32);
  return {id,title,summary,source,sourceUrl:url.href,occurredAt:new Date(timestamp).toISOString(),severity,countries,tags};
}
function overlap(a,b){if(!a.size||!b.size)return 0;let n=0;for(const x of a)if(b.has(x))n++;return n/(a.size+b.size-n);}
export class SelfhostedIntelMemory {
  #events=new Map();#now;#maxAgeMs;#maxEntries;
  constructor({now=()=>Date.now(),maxEntries=5000,maxAgeMs=365*86400000}={}){
    if(typeof now!=='function')throw new TypeError('Invalid clock');
    if(!Number.isInteger(maxEntries)||maxEntries<1||maxEntries>50000)throw new RangeError('maxEntries 1..50000');
    if(!Number.isFinite(maxAgeMs)||maxAgeMs<=0)throw new RangeError('maxAgeMs > 0');
    this.#now=now;this.#maxAgeMs=maxAgeMs;this.#maxEntries=maxEntries;
  }
  #prune(){
    const cutoff=this.#now()-this.#maxAgeMs;
    for(const [id,e] of this.#events)if(Date.parse(e.occurredAt)<cutoff)this.#events.delete(id);
    if(this.#events.size>this.#maxEntries){
      const sorted=[...this.#events.values()].sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)||a.id.localeCompare(b.id));
      this.#events=new Map(sorted.slice(0,this.#maxEntries).map(e=>[e.id,e]));
    }
  }
  ingest(items){
    if(!Array.isArray(items)||items.length>5000)throw new TypeError('Expected at most 5000 events');
    const validated=items.map(normalize); // validate entire batch before mutation
    let inserted=0,updated=0;
    for(const e of validated){if(this.#events.has(e.id))updated++;else inserted++;this.#events.set(e.id,e);}
    this.#prune();return {inserted,updated,retained:this.#events.size};
  }
  get(id){this.#prune();const e=this.#events.get(id);return e?structuredClone(e):null;}
  search({query='',countries=[],tags=[],from,to,minSeverity=0,limit=50}={}){
    if(!Number.isInteger(limit)||limit<1||limit>200)throw new RangeError('limit 1..200');
    if(!Number.isInteger(minSeverity)||minSeverity<0||minSeverity>5)throw new RangeError('minSeverity 0..5');
    const start=from?Date.parse(from):-Infinity,end=to?Date.parse(to):Infinity;
    if(Number.isNaN(start)||Number.isNaN(end))throw new TypeError('Invalid date filter');
    const q=tokens(query),c=set(countries,/^[A-Z]{2}$/),t=set(tags,/^[A-Z0-9][A-Z0-9 _-]{0,39}$/);
    this.#prune();
    return [...this.#events.values()].filter(e=>{
      const time=Date.parse(e.occurredAt);
      const words=tokens(e.title+' '+e.summary+' '+e.tags.join(' '));
      return time>=start&&time<=end&&e.severity>=minSeverity&&c.every(x=>e.countries.includes(x))&&t.every(x=>e.tags.includes(x))&&[...q].every(x=>words.has(x));
    }).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)||a.id.localeCompare(b.id)).slice(0,limit).map(e=>structuredClone(e));
  }
  similar(id,{limit=10,minScore=.15}={}){
    if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isFinite(minScore)||minScore<0||minScore>1)throw new RangeError('Invalid similarity settings');
    this.#prune();const base=this.#events.get(id);if(!base)return [];
    const words=tokens(base.title+' '+base.summary),tags=new Set(base.tags),countries=new Set(base.countries);
    return [...this.#events.values()].filter(e=>e.id!==id).map(e=>({
      ...structuredClone(e),
      similarity:Number((.6*overlap(words,tokens(e.title+' '+e.summary))+.25*overlap(tags,new Set(e.tags))+.15*overlap(countries,new Set(e.countries))).toFixed(4))
    })).filter(e=>e.similarity>=minScore).sort((a,b)=>b.similarity-a.similarity||b.occurredAt.localeCompare(a.occurredAt)).slice(0,limit);
  }
  snapshot(){this.#prune();return {schemaVersion:1,exportedAt:new Date(this.#now()).toISOString(),events:[...this.#events.values()].map(e=>structuredClone(e))};}
  get size(){this.#prune();return this.#events.size;}
}
export async function loadIntelMemory(file,options){
  const store=new SelfhostedIntelMemory(options);let data;
  try{data=await readFile(file,'utf8')}catch(e){if(e.code==='ENOENT')return store;throw e}
  if(Buffer.byteLength(data)>50_000_000)throw new RangeError('Snapshot too large');
  const parsed=JSON.parse(data);
  if(parsed?.schemaVersion!==1||!Array.isArray(parsed.events)||parsed.events.length>50000)throw new TypeError('Invalid snapshot');
  for(let i=0;i<parsed.events.length;i+=5000)store.ingest(parsed.events.slice(i,i+5000));
  return store;
}
export async function saveIntelMemory(store,file){
  if(!(store instanceof SelfhostedIntelMemory))throw new TypeError('Expected SelfhostedIntelMemory');
  const temp=join(dirname(file),'.'+basename(file)+'.'+randomUUID()+'.tmp');
  try{await writeFile(temp,JSON.stringify(store.snapshot())+'\n',{mode:0o600,flag:'wx'});await rename(temp,file);}
  finally{await unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e})}
}
