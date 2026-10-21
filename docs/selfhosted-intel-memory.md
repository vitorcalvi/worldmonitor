# Self-hosted intelligence memory

This is an independent local implementation of one documented analyst-workflow capability. It **does not** provide WorldMonitor-hosted Pro history or circumvent hosted entitlements.

Code: [server/selfhosted-intel-memory.mjs](../server/selfhosted-intel-memory.mjs).

## Usage

```js
import {SelfhostedIntelMemory,loadIntelMemory,saveIntelMemory} from './server/selfhosted-intel-memory.mjs';
const store=await loadIntelMemory('/data/intelligence-memory.json');
store.ingest([{
  title:'Event title',summary:'Attributed report',source:'Licensed feed',
  sourceUrl:'https://example.org/article',occurredAt:new Date().toISOString(),
  countries:['YE'],tags:['SHIPPING'],severity:3
}]);
const timeline=store.search({query:'shipping',countries:['YE']});
const related=store.similar(timeline[0].id);
await saveIntelMemory(store,'/data/intelligence-memory.json');
```

**Properties:** HTTPS source provenance required; validated event dates and integer severity; ID deduplication; time and country filters; deterministic token/tag/country similarity, not causal inference; bounded retention; atomic JSON snapshots with `0600` file mode; no outbound network calls.

**Current limitations:** No automatic feed ingestion, scheduler, dashboard UI, multi-user permission model, cloud synchronization or encrypted-at-rest storage. For deployment, supply a private persistent path, authorize any caller that can read or write events, and respect every upstream source's terms.

Test: `node --test tests/selfhosted-intel-memory.test.mjs`. Seven tests passed on the Linux operator host, including restart persistence.
