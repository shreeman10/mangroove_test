# Caching Architecture — MangroveAI Dashboard

This document explains how caching works in this project and why the app feels slow
only on first load (~40s while Google Earth Engine trains the Random Forest model),
then stays fast during region switches, year scrubbing and timeline playback.

---

## 1. The problem being solved

For every `(region, year)` pair, `/api/classify/[region]` runs the full pipeline on
Earth Engine's servers:

```
GMW reference layer → stratifiedSample (~400 pts) → S2 median composite
→ sampleRegions → Random Forest training → classify → focalMode → 3-class split → stats
```

That costs ~40 seconds per request. Without caching, every year change on the timeline
would re-run everything. The goal: **run each pipeline once, reuse it forever after.**

---

## 2. Architecture overview

There are three layers of caching:

| Layer | Where | What is cached |
|---|---|---|
| 1 | Browser (TanStack Query defaults) | Global freshness window |
| 2 | Browser (per-query keys) | Each `(region, year)` result |
| 3 | Next.js server (`lib/gee.ts`) | Earth Engine authentication |

> **Note:** There is *no* HTTP-level or database cache on the server. Every route handler
> runs the pipeline fresh when asked — caching is purely client-driven.

---

## 3. Layer 1 — Global query defaults

**File:** `providers/queryProviders.tsx`

```tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10 * 60 * 1000,      // data counts as "fresh" for 10 minutes
      refetchOnWindowFocus: false,    // don't re-run GEE when tab regains focus
    },
  },
})

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
```

- `staleTime` is the key setting: within 10 minutes a cached result is treated as
  fresh, so switching back to a year you already viewed never hits the network again.
  With the default `staleTime: 0`, every switch would re-trigger the 40s pipeline.
- `refetchOnWindowFocus: false` prevents an accidental alt-tab from re-running GEE.
- `QueryClientProvider` makes this single client available to the whole component tree,
  so all `useQuery` calls in the dashboard share one cache store.

---

## 4. Layer 2 — Per-pair cache keys (the TanStack part)

**File:** `app/page.tsx`

```tsx
const imagery = useQuery({
  queryKey: ["imagery", region, year],        // e.g. ["imagery", "thane-creek", "2024"]
  queryFn: fetchImagery,
  placeholderData: keepPreviousData,
  staleTime: 10 * 60 * 1000,
})

const analysis = useQuery({
  queryKey: ["classify", region, year],       // e.g. ["classify", "thane-creek", "2023"]
  queryFn: classifyFetch(year),
  placeholderData: keepPreviousData,
  staleTime: 10 * 60 * 1000,
})

// Baseline year stats for the "% change vs 2020" badge.
// Same cache key as the main query when year === baseline → no extra run.
const baseline = useQuery({
  queryKey: ["classify", region, BASELINE_YEAR],   // ["classify", region, "2020"]
  queryFn: classifyFetch(BASELINE_YEAR),
  enabled: year !== BASELINE_YEAR,
  staleTime: 10 * 60 * 1000,
})
```

### 4.1 `queryKey` = cache address

Every unique `[type, region, year]` array gets its own cache slot:

```
["imagery",   "thane-creek", "2024"]  → RGB thumbnail URL
["classify",  "thane-creek", "2024"]  → mask URL + stats
["classify",  "thane-creek", "2023"]  → mask URL + stats
...
```

When the timeline sets a new year, React Query looks up that key:
- **Hit & fresh** (within `staleTime`) → served instantly from memory, zero network.
- **Miss** → `queryFn` runs once, result stored under that key forever after.

This is why looping through years with Play becomes effectively instant after the
first full cycle.

### 4.2 `placeholderData: keepPreviousData` — no blank flash

When you move 2024 → 2022, the `"2022"` key has no data *yet*. Instead of unmounting
into a loading spinner, React Query keeps serving the previous year's images/stats
while the new fetch runs.

You detect this state because `isLoading` stays `false` but `isFetching` becomes
`true` — which drives the small pill in the map panel:

```tsx
// page.tsx
const loading  = imagery.isLoading || analysis.isLoading     // first load only
const fetching = imagery.isFetching || analysis.isFetching   // any background refetch

// map-panel.tsx
{fetching && !loading && (
  <div className="..."><Loader2 className="animate-spin" /> Updating…</div>
)}
```

State cheat sheet for a key:

| State | Meaning |
|---|---|
| `isLoading` | No cached data at all for this key yet → full spinner |
| `isFetching` | A network round trip is in progress (incl. background updates) |
| `data` | Last known payload (previous year's, thanks to `keepPreviousData`) |
| `error` | Set if `queryFn` threw; surfaced in the map panel error view |

### 4.3 Baseline dedupe

The `% change vs 2020` badge needs the 2020 stats. The baseline query uses the same
key pattern as the main analysis query:

- Viewing 2024 → baseline query fires **once** for 2020, then cached like any other entry.
- User selects 2020 directly → main query and baseline query resolve to the
  **same key** `["classify", region, "2020"]`, so TanStack dedupes them into a single
  request. No duplicate GEE run.

```ts
// StatsPanel receives both and computes the trend badge:
const changePct =
  total !== undefined &&
  baselineStats &&
  baselineStats.totalHectares > 0 &&
  year !== BASELINE_YEAR
    ? ((total - baselineStats.totalHectares) / baselineStats.totalHectares) * 100
    : null
```

---

## 5. Layer 3 — Server-side auth singleton

**File:** `lib/gee.ts`

```ts
let initialized = false                         // fast path flag
let initPromise: Promise<void> | null = null    // in-flight guard

export function getEE(): Promise<typeof ee> {
  if (initialized) {
    return Promise.resolve(ee)                  // subsequent calls: free
  }
  if (initPromise) {
    return initPromise.then(() => ee)           // concurrent calls wait on same promise
  }

  initPromise = new Promise((resolve, reject) => {
    const privateKey = loadPrivateKey()
    ee.data.authenticateViaPrivateKey(privateKey, () => {
      ee.initialize(null, null,
        () => { initialized = true; resolve() },   // success → flip flag
        (err) => reject(...),
        null,
        privateKey.project_id
      )
    }, (err) => reject(...))
  })

  return initPromise.then(() => ee)
}
```

This caches the **authentication**, not data:

1. First API hit → reads service-account JSON → OAuth → `ee.initialize()`.
2. Every later request skips straight to returning the ready `ee` object.
3. `initPromise` also prevents a race where two requests arriving simultaneously
   would both try to authenticate — they share the same promise.

---

## 6. Timeline playback flow

```
Play pressed
  └─ setInterval every 4s: setYear(next)
       └─ useQuery sees new key ["…", region, next]
            ├─ first visit  → fetch /api/classify (≈40s), cached on arrival
            └─ repeat visit → instant from cache
```

So one full pass through 2020–2024 is slow-ish; every pass afterwards is smooth.

---

## 7. Cache lifetime summary

| Mechanism | Scope | Lifetime |
|---|---|---|
| `staleTime: 10 min` | Per key | Data considered fresh; no refetch inside window |
| In-memory cache store | Per key | Survives year/region switches while the tab lives |
| GC of unused entries | Per key | Default `gcTime` (5 min) after a key goes fully unused |
| `getEE()` singleton | Server process | Until the dev server restarts |

**Net effect:** ~40s once for your selected year (+~40s once for the 2020 baseline,
running in the background), then everything — region switches, year scrubbing,
timeline playback, going back and forth — is served from memory.

---

## 8. What is *not* cached (and the upgrade path)

Each Next.js route handler runs the pipeline fresh — there is no HTTP-level or DB
cache server-side. Two browsers hitting `/api/classify/thane-creek?year=2024` make
GEE train twice. For a single-user demo that's fine.

If shared caching were ever needed, the natural next step would be Next.js
`revalidate` / fetch-data-cache on those routes — intentionally out of scope for
this demo.
