# Self-hosted intelligence desk: implementation map

This is a user-maintained [AGPL-3.0-only](../LICENSE) fork of the public WorldMonitor project. It is **not** WorldMonitor Pro, does **not** include a WorldMonitor Pro subscription, and does not attempt to bypass paid-hosted endpoints, licenses, data entitlements, or quotas.

## Publicly documented functionality to implement independently

| Area | Local equivalent | Acceptance criterion |
| --- | --- | --- |
| Analyst chat | Bring-your-own-key LLM, server-only credentials, context collected from authorized sources | Claims cite actual URLs and timestamps, errors degrade safely |
| Scenario Engine | Deterministic risk and shock calculator | Compare baseline and shock, state assumptions and uncertainty |
| Route Explorer | Public route/chokepoint risk overlays | Only user-supplied or licensed publicly available route data |
| Supply-chain stress | Chokepoint, sector and country exposure | Transparent cost sensitivity, no invented inputs |
| Intelligence memory | Local sourced event history and similarity search | Deduplication, relevance, retention, provenance |
| Custom widgets | Validated dashboard widget schemas and layouts | Sanitized content and persisted layout |
| AI digests | Ranking, deduplication and delivery | Scheduled, source-attributed summaries with dry-run test |
| Alert rules | Thresholds, severity, deduplication | Idempotent notifications and safe destination validation |
| Equity and macro | BYOK market data adapters and analysis | Explicit vendor attribution, market timestamps, no investment advice implied |
| Country intelligence | Existing free briefs + custom sourced analysis | Linkable sources and time ranges |
| Exports | Local JSON/CSV/PDF reports | Escaped content and no data rights violations |
| Connector interface | Local MCP and API routes under operator control | Protected sensitive routes, no open proxy |
| Security and deployment | Docker Compose inside Dokploy, isolated secrets | Authentication, health, tests, rollback, backups |

## Worktree tracks

Independent implementation tracks started with ZeroClaw: analyst, scenario engine, custom widgets and digests/alerts. These are **in progress** until their patches are reviewed and the target tests pass. Do not describe a queued job, successful commit, or HTTP 200 as full feature parity.

### Engineering rules

1. Retain original copyright notices, AGPL license, a prominent modified-fork notice, and corresponding-source access obligations for deployments.
2. Do not copy any closed-source Pro code or proprietary assets, scrape authenticated services, disable plan restrictions on the hosted service, or share/automate paid subscriber accounts.
3. Prefer open data, official APIs with user-controlled keys, accurate provenance, and source-specific licenses. Some premium upstream data cannot be lawfully reproduced from free services.
4. Keep operator credentials in server env/secret managers; never commit keys.
5. Run unit tests, security checks and actual live end-to-end tests before deployments; deploy Dokploy-managed instances only through Dokploy.
6. Keep the working local deployment at 192.168.1.45:8105 unchanged until an integrated build is explicitly verified.

## Baseline sources

- https://github.com/koala73/worldmonitor
- https://www.worldmonitor.app/pro
- https://www.worldmonitor.app/pricing.md
- https://github.com/koala73/worldmonitor/blob/main/docs/license.mdx

This roadmap records intended **functional equivalents**, not access to the hosted premium product.
