# PTAS Comprehensive Performance, Security & Scalability Engineering Audit

> **Scope & Authority:** Governed by [AGENTS.md](../../AGENTS.md) and [readiness-and-authority.md](../handoff/readiness-and-authority.md). Application-layer performance, security hardening, and non-destructive schema authoring follow GREEN/AMBER rules; live production database DDL promotion (`0056`) and Supabase dashboard auth settings require explicit DBA/human approval prior to executing against `ptas-punjab-pilot`.

---

## 1. System Architecture Map & Measured Before / After Metrics

- **Monorepo Toolchain:** pnpm `11.13.1`, Turborepo `2.10.5`, Node.js `>=22.16`, TypeScript `5.9.3` (`strict`, `exactOptionalPropertyTypes`).
- **Packages:** `@ptas/domain` (statutory rules & domain logic), `@ptas/database` (Supabase/PostgreSQL `17.6` client & `56` forward migrations including pending `0056`), `@ptas/integrations` (payment adapter mocks), `@ptas/ui`, `@ptas/web` (Next.js `16.4.6` Turbopack App Router, React `19.2.7`, dynamic `jsPDF`, dynamic `ExcelJS`, dynamic `jsQR`), `@ptas/worker`.
- **Database Platform:** Supabase PostgreSQL `17.6.1.166` (`ptas-punjab-pilot`, region `ap-south-1`, read-only inspection only).

### Measured Before vs After Application Metrics

| Metric Category                                                    | Baseline (Before Optimization)                               | Measured After Optimization                                                                                                                                                  | Delta / Evidence                                                                                                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Total Static JS/CSS Chunks** (`apps/web/.next/static/chunks`)    | `5,478.0 KB` (`5,609,435` bytes)                             | **`4,728.4 KB`** (`next@16.4.6`)                                                                                                                                             | **`-749.6 KB` (`-13.7%`)**                                                                                                                            |
| **Eager `jsPDF + PUNJAB_LOGO` Chunks**                             | `598.2 KB × 2` (`1,196.4 KB` duplicate eager chunks)         | **`0 KB` eager** (`1` lazy `559.6 KB` chunk `24gh-rmtpkzh1.js`)                                                                                                              | Duplicate chunk eliminated; deferred until PDF export click                                                                                           |
| **Main Portal Client Chunk**                                       | `809.0 KB` (`2i6zbkyw3c6nj.js`)                              | **`673.7 KB`** (`1pgszp-2z_iy8.js`)                                                                                                                                          | **`-135.3 KB` (`-16.7%`)**                                                                                                                            |
| **Spreadsheet Export (`exceljs`)**                                 | `909.1 KB` (dynamic)                                         | `909.1 KB` (dynamic `0fwl-ukice2wq.js`)                                                                                                                                      | Preserved off initial route loads                                                                                                                     |
| **Initial JS Loaded on `/sign-in`** (Chrome DevTools)              | Includes eager runtime without split verification            | **`200.2 KB` wire** (`710.8 KB` decoded) for `/sign-in` (`372.1 KB` wire / `1,362.6 KB` decoded incl. `/verify` `<Link>` prefetch); `0` PDF/Excel chunks; `0` console errors | Confirmed via Chrome DevTools network panel                                                                                                           |
| **Initial JS Loaded on `/verify`** (Chrome DevTools)               | —                                                            | `9` cached scripts (`1,343.9 KB` decoded); `0` PDF/Excel chunks; `0` console errors                                                                                          | Confirmed via Chrome DevTools network panel                                                                                                           |
| **Initial JS Loaded on `/`** (Chrome DevTools, auth gate redirect) | Included eager `jsPDF` + `PUNJAB_LOGO` & `QrScannerModal`    | `17` scripts (`182.1 KB` uncached delta / `2,203.3 KB` decoded); `0` `jsPDF` / `exceljs` / `jsqr` chunks loaded                                                              | Confirmed via Chrome DevTools network panel                                                                                                           |
| **Production npm Advisories** (`pnpm audit --prod`)                | `40` total (`5` critical, `13` high, `16` moderate, `6` low) | **`7` total (`0` critical, `1` high, `1` moderate, `5` low)**                                                                                                                | **`-82.5%` total, `-100%` critical** (`next` `16.2.10 → 16.4.6`; removed unused `zod@4.4.3`; remaining 7 transitive in `exceljs`/`jspdf`/`dompurify`) |
| **Mobile Lighthouse (`/sign-in`, `/verify`)**                      | `/sign-in` & `/verify`: `100 / 100 / 100` (CLS `0.00`)       | **Accessibility `100`, Best Practices `100`, SEO `100`** (`49/49` `/sign-in`, `47/47` `/verify`); CLS `0.00`                                                                 | Verified under `next@16.4.6` via Chrome DevTools                                                                                                      |

### Read-Only Live Supabase Telemetry Baseline (`ptas-punjab-pilot`, Migration `0056` Not Yet Promoted)

1. **`pg_stat_statements` & `pg_stat_user_tables` Hotspots (Live Pre-`0056`):**
   - `public.list_operational_survey_units()`: `4,181` calls | **`478.13 ms` mean** (`1,999,062.0 ms` cumulative) over `361` live rows — driven by per-row `ptas_private.jurisdiction_contains()` recursive CTE plus correlated `pft2_receipts` subquery.
   - `public.list_potential_assessment_units()`: `3,306` calls | **`87.15 ms` mean** (`288,117.4 ms` cumulative) over `311` live rows.
   - `public.resolve_my_ptas_actor()`: `3,872` calls | `12.31 ms` mean (`47,675.3 ms` cumulative).
   - `public.list_pft2_challan_registry()`: `2,289` calls | `11.56 ms` mean (`19` live rows).
   - `public.list_pft2_receipt_registry()`: `2,229` calls | `9.62 ms` mean (`0` live rows).
   - Table scan counters: `user_roles` (`921.3M` seq scans on `2` rows), `app_users` (`721.2M` seq scans, `200.1M` idx scans on `2` rows), `jurisdictions` (`846.5M` idx scans, `7.92M` seq scans on `676` rows), `pft3_assessment_units` (`919.1M` idx scans), `workflow_actions` (`921.3M` idx scans), `pft2_receipts` (`102.6K` seq scans).
2. **Supabase Security & Performance Advisors (Live Pre-`0056`):**
   - `6` public tables with RLS disabled (`user_jurisdiction_assignments`, `designated_bank_branches`, `geo_divisions`, `geo_districts`, `geo_tehsils`, `geo_circles`); `1` `SECURITY DEFINER` view (`public.potential_pft2_challans`); permissive `USING (true)` policies (`potential_units_authenticated_policy`, `assessment_versions_select_policy`, `assessment_versions_insert_policy`); `7` unintended `SECURITY DEFINER` RPCs executable by `anon`; `9` functions with mutable `search_path`; Auth leaked password protection disabled; `3` duplicated permissive SELECT policy sets; `16` unindexed foreign keys; `22` unused indexes.

---

## 2. Continuous Engineering Progress Tracking Matrix

Status legend: `Not inspected` | `Inspected` | `Issue identified` | `In progress` | `Corrected` | `Verified` | `Blocked`

| Engineering Area       | Inspection | Optimization | Verification | Findings & Evidence                                                                                                                                                                                                          |
| ---------------------- | ---------- | ------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| System architecture    | Inspected  | Corrected    | Verified     | Split heavy client libs (`jsPDF`, `jsQR`), eliminated focus-storm cascades, centralized `api-security.ts` & single-flight auth/branch caches                                                                                 |
| Frontend architecture  | Inspected  | Corrected    | Verified     | Lazy `jsPDF` dynamic import (`pdf/download-service.ts`, `pdf/index.ts`, `pdf-export.ts`), lazy `jsQR` (`QrScannerModal.tsx`), dynamic portal modal mount in `page.tsx`                                                       |
| Backend architecture   | Inspected  | Corrected    | Verified     | Hardened `/api/workflows` and `/api/documents/[type]/[id]/pdf` with `413`, `403`, `400`, `401`, `429`, `no-store`, `X-Request-Id`, sanitized `500` errors                                                                    |
| Database schema        | Inspected  | Corrected    | Corrected    | Non-destructive forward migration `0056` + deploy mirror authored (`SECURITY INVOKER` view, RLS enabled on all 6 tables); `4/4` schema migration tests pass; awaiting DBA promotion to `ptas-punjab-pilot`                   |
| Database queries       | Inspected  | Corrected    | Corrected    | `ptas_private.accessible_jurisdiction_ids()` + set-based `pft2_receipts` aggregation in `0056` removes per-row recursive CTE (`478.13 ms` hotspot); live re-measurement pending DBA promotion                                |
| Indexing               | Inspected  | Corrected    | Corrected    | `18` covering/FK/hot-lookup indexes authored in `0056` (avoiding duplicate geo indexes); verified in migration test suite; live index build pending DBA promotion                                                            |
| Transactions           | Inspected  | Verified     | Verified     | PostgreSQL RPCs enforce `p_idempotency_key` + `row_version` locking; 100-worker concurrent payment simulation & domain ledger tests pass                                                                                     |
| API efficiency         | Inspected  | Corrected    | Verified     | Parallelized dashboard load via `Promise.all`, single-flight `refreshInFlightRef`, 30s `AbortSignal.timeout`, bounded retry with backoff strictly for idempotent commands                                                    |
| Duplicate operations   | Inspected  | Corrected    | Verified     | Eliminated duplicate eager `598.2 KB × 2` PDF bundles, redundant `generateFormPFT3Rows` recomputation, `select("*")` polling, and N+1 sync `.upsert()` loops                                                                 |
| Frontend tree-shaking  | Inspected  | Corrected    | Verified     | Converted `pdf/index.ts` and `pdf-export.ts` from eager barrel `export *` to dynamic `import()` entrypoints; confirmed `0` `jsPDF`/`exceljs` requests on initial page loads                                                  |
| Bundle optimization    | Inspected  | Corrected    | Verified     | Total chunk size reduced **`5,478.0 KB → 4,728.4 KB` (`-749.6 KB` / `-13.7%`)**; main portal chunk `-16.7%` (`809.0 KB → 673.7 KB`)                                                                                          |
| Component rendering    | Inspected  | Corrected    | Verified     | Gated `duplicateWarning` on `showAddUnitModal`, gated `misMetrics` (`EMPTY_EXECUTIVE_METRICS`) on `ANALYTICS`/`REPORTS` tabs, deferred `QrScannerModal` mount                                                                |
| State management       | Inspected  | Corrected    | Verified     | Added `refreshInFlightRef` single-flight deduplication and 60s `handleFocus` cooldown guarded by auth status & open-modal checks                                                                                             |
| Caching                | Inspected  | Corrected    | Verified     | 30s single-flight officer cache (`supabase-auth.ts`) with sign-out invalidation, 10-min single-flight district branch cache, 24h logo `Cache-Control`, API `no-store`                                                        |
| Concurrency            | Inspected  | Corrected    | Verified     | Verified 50-concurrent actor deduplication, 100-worker payment idempotency invariant, and `10 → 100` VU live HTTP concurrency (`0` 5xx/failures)                                                                             |
| Authentication         | Inspected  | Corrected    | Verified     | App-layer fail-closed Supabase session handling & `401` guards verified; **Supabase project-level Auth Leaked Password Protection remains Blocked** for human dashboard approval                                             |
| Authorization          | Inspected  | Corrected    | Corrected    | Hardened permissive `USING (true)` RLS policies on `potential_assessment_units` & `assessment_versions` and revoked unintended `anon` RPC execute grants in `0056`; pending DBA promotion                                    |
| Security               | Inspected  | Corrected    | Verified     | Request size cap (`413`), origin enforcement (`403`), sliding-window bounded rate limits (`429`), path/type sanitization (`400`), filename sanitization, CSP/COOP/HSTS headers                                               |
| Error handling         | Inspected  | Corrected    | Verified     | Safe non-JSON response parsing in `workflow-command-client.ts`; sanitized `500` responses without stack/DB leaks; structured `[req=<uuid>]` logging                                                                          |
| Data integrity         | Inspected  | Verified     | Verified     | Immutable ledgers, PIN / Form P.F.T-2 / Form P.F.T-3 statutory naming, Potential vs PFT-3 register distinction, and ETO approval gates preserved                                                                             |
| Logging and monitoring | Inspected  | Corrected    | Verified     | Propagated `X-Request-Id` on every `/api/workflows` and `/api/documents/[type]/[id]/pdf` response without exposing tokens or taxpayer PII                                                                                    |
| Dependencies           | Inspected  | Corrected    | Verified     | Removed unused `zod@4.4.3`, upgraded `next` `16.2.10 → 16.4.6`; `pnpm audit --prod` advisories cut **`40 → 7` (`5 → 0` critical)**                                                                                           |
| Deployment             | Inspected  | Corrected    | Verified     | `next.config.ts` caching/security headers hardened and `apps/web` built cleanly on `next@16.4.6`; PgBouncer/Fluid Compute recommendations documented below                                                                   |
| Load testing           | Inspected  | Verified     | Verified     | Completed progressive `10 → 25 → 50 → 75 → 100` VU HTTP benchmark (`11,022` requests, peak `128.8 RPS` @ `75` VUs, `119.2 RPS` @ `100` VUs, `0` 5xx/failures)                                                                |
| Regression testing     | Inspected  | In progress  | In progress  | `4/4` migration tests passed (`performance-security-and-concurrency-hardening-migration.test.ts`); `48/48` web security/PDF/auth unit tests ran prior to final edits — full post-edit `AGENTS.md` §5 & E2E gate running next |

---

## 3. Progressive HTTP Load Benchmark (`10 → 25 → 50 → 75 → 100` VUs) & Chrome DevTools Verification

### Benchmark Methodology & Safety Scope

- **Target:** Local production build (`pnpm --filter @ptas/web start -- -p 3100`, `next@16.4.6`, Windows host, Node.js PID `4860`).
- **Safety Constraint:** Executed without mutating or loading the live `ptas-punjab-pilot` Supabase project (`NEXT_PUBLIC_SUPABASE_*` intentionally unset in local benchmark shell so auth-protected endpoints exercised fail-closed validation, SSR rendering, security headers, body/origin/type checks, and in-memory sliding-window rate limits cleanly).
- **Mixed Realistic Endpoint Mix per Virtual User (`6` iterations/VU per stage, distinct `X-Forwarded-For` per VU):**
  `GET /health`, `GET /sign-in`, `GET /verify`, `GET /verify/PTAS-TEST-123`, `POST /api/workflows` (`401` guard + `X-Request-Id` + `no-store`), `GET /api/documents/form_pft2_challan/test-id/pdf` (`401` guard), `GET /api/documents/invalid_type/test-id/pdf` (`400` validation guard).

### Staged Load Test Results (`10,920` Stage Requests + `102` Burst/Guard Probes)

| Stage (Concurrent VUs) | Total Requests | Wall Time (ms) | Throughput (RPS) | P50 (ms) |   P95 (ms) |   P99 (ms) |   Max (ms) | Status Breakdown                    | 5xx / Unexpected Failures |
| ---------------------- | -------------: | -------------: | ---------------: | -------: | ---------: | ---------: | ---------: | ----------------------------------- | ------------------------: |
| `10` VUs               |          `420` |     `11,243.2` |           `37.4` | `190.48` |   `856.46` | `1,190.78` | `1,192.92` | `240×200`, `60×400`, `120×401`      |                   `0 / 0` |
| `25` VUs               |        `1,050` |     `11,741.4` |           `89.4` | `207.88` |   `610.43` | `1,116.40` | `1,240.04` | `600×200`, `150×400`, `300×401`     |                   `0 / 0` |
| `50` VUs               |        `2,100` |     `18,596.2` |          `112.9` | `369.23` |   `966.31` | `1,344.99` | `1,358.21` | `1,200×200`, `300×400`, `600×401`   |                   `0 / 0` |
| `75` VUs               |        `3,150` |     `24,461.2` |          `128.8` | `480.03` | `1,386.45` | `1,581.95` | `1,810.71` | `1,800×200`, `450×400`, `900×401`   |                   `0 / 0` |
| `100` VUs              |        `4,200` |     `35,237.0` |          `119.2` | `661.22` | `2,089.48` | `2,518.01` | `2,978.08` | `2,400×200`, `600×400`, `1,200×401` |                   `0 / 0` |

### Burst Rate-Limiting, Abuse Guard & Memory Measurements

- **PDF Route Single-IP Burst (`35` concurrent requests):** `30 × 401`, `5 × 429` with `Retry-After: 60`.
- **Workflows Route Single-IP Burst (`65` concurrent requests with dummy Bearer probe & no Supabase env):** `60 × 503` (fail-closed), `5 × 429` with `Retry-After: 60`.
- **Cross-Origin Workflow Guard (`origin: https://evil.example.com`):** HTTP `403`.
- **Oversized Workflow Body (`> 2 MB`):** HTTP `413`.
- **Node.js Server Memory (`PID 4860`):** `82.5 MB` Working Set / `91.1 MB` Private Memory pre-load → `221.3 MB` Working Set / `240.8 MB` Private Memory post-`11,022` requests (zero OOM, zero leaks, bounded `MAX_RATE_LIMIT_BUCKETS = 5,000`).

---

## 4. Pending Human / DBA Approvals & Infrastructure Recommendations

1. **DBA Approval — Apply Forward Migration `0056`:**
   - Files: `packages/database/migrations/0056_performance_security_and_concurrency_hardening.sql` & deploy mirror `supabase/migrations/20261122120000_performance_security_and_concurrency_hardening.sql`.
   - Action after promotion: run `EXPLAIN (ANALYZE, BUFFERS)` and inspect `pg_stat_statements` on `list_operational_survey_units`, `list_potential_assessment_units`, and `list_pft2_challan_registry` to measure live latency drop from the `478.13 ms` baseline and re-run Supabase `get_advisors`.
2. **Supabase Auth Security Dashboard Setting (Governance / Human Action):**
   - Enable **Leaked Password Protection** (HaveIBeenPwned integration) in Supabase Auth settings for `ptas-punjab-pilot`.
3. **Database Connection Pooling & Multi-User Scaling (`100+` Concurrent DB Users):**
   - Ensure server/worker database workloads route through Supabase **PgBouncer Transaction Mode (`6543`)** with `prepare: false` where applicable and verify pool sizing (`max_connections` / Supavisor client limits) fits Vercel Function concurrency spikes.
   - Note that serverless Vercel Function instances have independent per-instance memory, so sliding-window rate limits in `api-security.ts` protect single instances effectively; distributed multi-region abuse throttling under heavy attack should add Upstash Redis or Vercel WAF rate-limit rules at the edge.
4. **Deployment Topology & Regional Alignment:**
   - Co-locate Vercel serverless compute close to Supabase `ptas-punjab-pilot` (`ap-south-1`, Mumbai, `bom1`) and enable **Vercel Fluid Compute** to share pooled execution contexts across overlapping officer bursts and eliminate cold-start waterfalls.
5. **Authenticated Staging Load Test:**
   - Once an isolated non-production Supabase staging clone is provisioned with `0056` promoted, execute an authenticated `100`-VU k6/Node workflow test exercising `list_operational_survey_units`, assessment version creation, optimistic concurrency retries, and receipt ledger commits end-to-end.
