# The local e2e stack: bigname, the pinned fork, and offline mode

How the manager e2e suite runs on a laptop: what is in the stack, how it was
built, and the two switches people mix up (mock vs real index, online vs
offline network). For the bigname image and its runner details see
[`../infra/bigname/README.md`](../infra/bigname/README.md); this page is the
overview.

_Status, 2026-10-13: the pinned fork, both caches and the hardened online mode
are on `e2e-tests-coverage` and in use. Full offline mode is being verified
(a run comparing an online and an offline pass of the suites); its section is
marked below until the results are in._

---

## Why the stack looks like this

- The **manager** reads every name from **bigname** (PR #1324). bigname is a
  hosted service, and the hosted Sepolia API cannot see anything the suite
  creates on a local fork. So the stack runs its **own bigname**, indexing the
  local chain.
- The local chain is **Anvil forking Sepolia**, not an empty chain: tests need
  the real ENS V1 and V2 contracts, premigrated names, the migration
  controllers and test USDC, all as deployed on Sepolia.
- The **portal** still reads **Panoptes** and the V1 subgraph shim; those run
  beside bigname. (Portal e2e is parked until the portal moves to bigname.)

## What runs

```
                  browser (Playwright, headless wallet)
                    │                          │
           manager app (vite dev)        portal app
             │            │                    │
   chain reads/tx     names, records     Panoptes / V1 shim
             │            │                    │
             ▼            ▼                    │
        ┌──────────┐  bigname-api :5660        │
        │  Anvil   │◄─── bigname-runner        │
        │  :8545   │      │                    │
        │ (fork of │   bigname-rpc ──────► public Sepolia RPC
        │ Sepolia  │   (router + disk cache)   (old blocks, cached)
        │ @ pinned │                           │
        │  block)  │◄──────────────────────────┘
        └────┬─────┘
             │ fork reads
             ▼
       upstream-cache :8548 ──► public Sepolia RPC
       (disk cache)               (state at the pinned block)
```

| Service | Port | Role |
| --- | --- | --- |
| `anvil` | 8545 | Sepolia fork at the pinned block; everything the app and tests write lands here |
| `upstream-cache` | (internal 8548) | Anvil's fork upstream, cached on disk |
| `bigname-runner` / `bigname-api` | 5660 | the manager's indexer, following Anvil |
| `bigname-rpc` | (internal 8547) | routes the runner's reads: pre-fork blocks to the public RPC (cached), the rest to Anvil |
| `bigname-postgres` | 5661 | bigname's database |
| `mockestrator` | 3007 | stands in for Rhinestone's orchestrator (smart-account intents) |
| `alto`, `paymaster` | 4337, 3002 | bundler and paymaster for the HCA path |
| `panoptes-*`, `v1-subgraph` | 5655, 5656 | the portal's indexers |
| `anvil-mainnet` | 8546 | mainnet fork, used only by the metadata service |
| dev servers | 3000/3001 (yours), 3010/3011, 3012 | manager and portal under test |

Start everything with `bash e2e/infra/scripts/start-local-env.sh`; stop with
`--down`.

## How it was built (what is non-standard)

1. **A patched bigname image.** Stock bigname refuses a Sepolia source that does
   not start at block 0. The image `bigname:e2e-anvil-fork` is built from the
   bigname branch `e2e/anvil-fork-start`, which adds a dev-only flag
   (`BIGNAME_DEV_ALLOW_SEPOLIA_START=1`). It also carries a fix for a stall
   when Anvil mines two blocks in the same second (E2E-022, commit `0f6c2171d`).
   That branch is local and unpushed. Build steps: the bigname README.
2. **Index from just below the fork.** The runner starts 2,064 blocks below
   Anvil's fork block (`BIGNAME_START=fork`), not at genesis: a couple of
   minutes of backfill instead of hours. Names that existed before the fork are
   partial; the suite makes its own.
3. **A fork-aware router (`bigname-rpc`).** The runner reads every header and
   log in its range. Sent through Anvil, each read is forwarded upstream one at
   a time and Anvil stops answering anyone else. The router sends pre-fork reads
   straight to the public RPC and the rest to Anvil.
4. **Reset rules.** bigname cannot follow a different chain with the database it
   indexed before. `start-local-env.sh` wipes and reindexes it whenever Anvil's
   fork block changes **or Anvil restarts** (a restarted Anvil forks the same
   block but drops its local history).
5. **Test helpers that wait for the index.** After a write, specs wait for
   bigname to publish the block, the name and its record keys
   (`helpers/bigname-sync.ts`); bigname lists record keys about 1 s after the
   block, and reading earlier silently loses records (E2E-024).

## Switch 1 — mock or real index (`E2E_MOCK_INDEXER`)

This is about **where the manager's name data comes from in a test**.

| `E2E_MOCK_INDEXER` | Name data | Used by |
| --- | --- | --- |
| `true` | Playwright route-mocks bigname in the browser (`helpers/mock-indexer.ts`, `mock-v1-names.ts`); the chain is still Anvil | CI, fast local runs |
| `false` (default locally) | the local bigname on :5660 | real-mode runs, anything needing subname trees or real indexing |

Mock mode cannot express V1 subname trees (those specs skip) and reports
whatever the test tells it; real mode catches indexing bugs and lag, at the
price of the bigname stack.

## Switch 2 — online or offline network (`FORK_RPC_OFFLINE`)

This is about **whether the local stack talks to public Sepolia at all**. Two
things need real Sepolia data: Anvil (state at the fork block, read lazily) and
bigname's router (the pre-fork blocks it indexes).

### The pinned fork and the caches

- **Pinned fork.** Anvil forks the block in [`../infra/fork-block`](../infra/fork-block)
  (11898020), not the latest one. Everything at or below that block never
  changes, so every answer about it can be kept.
- **`upstream-cache`** sits between Anvil and the public RPC and keeps every
  answer at the pinned block on disk (`anvil-upstream-cache` volume). Anvil's
  own fork cache (`storage.json`, `anvil-fork-cache` volume) is kept too, but
  on its own it cannot start Anvil offline: Anvil still fetches the fork block's
  header.
- **`bigname-rpc`** keeps every upstream answer (pre-fork blocks, logs,
  transactions) on disk (`bigname-rpc-cache` volume). It looks transactions up
  on Anvil first: asking the public RPC first cost one request per test
  transaction and drew the rate limits that stalled bigname on 2026-10-12.
- **Chain clock.** A pinned fork starts at its block's timestamp. On a fresh
  chain `start-local-env.sh` steps the clock forward to now (never back):
  intents and sessions are dated by the wall clock, and HCA registration fails
  when the chain lags it.

### Online mode (default)

`FORK_RPC_OFFLINE=0`. Cache misses go to the public RPC and are then kept.
Measured on 2026-10-12/13:

- bigname's router answered from its cache with **zero misses** across two full
  suite runs — bigname needs no network once warm;
- Anvil asks the public RPC only for state it has not seen (about 130 requests
  a minute during a suite run, within free-tier limits).

Set the upstreams when you start the stack; one needs genesis/old headers:

```sh
SEPOLIA_FORK_URL=https://ethereum-sepolia-rpc.publicnode.com \
BIGNAME_UPSTREAM_RPC_URL=https://sepolia.gateway.tenderly.co \
  bash e2e/infra/scripts/start-local-env.sh
```

### Offline mode — _being verified_

`FORK_RPC_OFFLINE=1`, upstreams pointed nowhere. Nothing leaves the machine.

```sh
SEPOLIA_FORK_URL=http://127.0.0.1:9 BIGNAME_UPSTREAM_RPC_URL=http://127.0.0.1:9 \
FORK_RPC_OFFLINE=1 bash e2e/infra/scripts/start-local-env.sh
```

- Warm the caches first: one online run of the suites.
- Every run creates **new names** (timestamped labels), so Anvil keeps asking
  about storage slots no run has seen. At the pinned block those are empty, but
  only the network can say so. Offline, `upstream-cache` therefore answers an
  unseen read of a storage slot, balance, nonce or code as empty, an unknown
  transaction or receipt as not found, and an unseen log query as no logs. A
  block header is never invented; a missing one is an error.
- **Safety check.** Online, `upstream-cache` compares every real answer with the
  empty one it would have given offline and logs each difference
  (`non-empty first read: …`, and a count in its per-minute stats line). After
  a warm-up that count should stay at 0; if it does not, offline answers for
  those reads would be wrong.
- Logs show what happened: `docker compose -f e2e/infra/docker-compose.yml logs
  upstream-cache` (hits, misses, answered empty) and `… --profile bigname logs
  bigname-rpc` (cache hits and misses).

_Results of the verification run go here._

### Moving the pin

After an ENS redeploy on Sepolia, or when you need newer Sepolia state: write
the new block to `e2e/infra/fork-block`, run online once to warm the caches, and
commit the file. `SEPOLIA_FORK_BLOCK=latest` forks the tip for a one-off run.

## Running the suites

```sh
cd e2e
# real index (local bigname)
MANAGER_APP_URL=http://localhost:3012 E2E_MOCK_INDEXER=false \
  npx playwright test --config=projects/manager/playwright.migration.config.ts
# mock index (as CI)
MANAGER_APP_URL=http://localhost:3012 E2E_MOCK_INDEXER=true \
  npx playwright test --config=projects/manager/playwright.config.ts
```

Start dev servers with `VITE_PUBLIC_POSTHOG_HOST=https://edge.ens.domains`:
`/upgrade` checks a PostHog flag server-side, and the host in older local `.env`
files no longer resolves, which sends `/upgrade` straight back to the
dashboard. Start two manager servers one after the other, not at once: their
Workers runtimes collide at startup.

## Manual testing on 3010

- Mock wallet: `VITE_USE_MOCK_WALLET=true` **with `VITE_FF_USE_EOA=false`**.
  With EOA on, the smart-account machine never runs and "Upgrade N names" does
  nothing when clicked.
- MetaMask against the fork estimates gas on real Sepolia (its own simulation,
  even with a localhost RPC), where your smart account does not exist, so
  migrations run out of gas. Use the mock wallet, or raise MetaMask's gas limit
  to about 700,000 by hand.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `bigname did not publish block … within 60000ms` | router upstream rate-limited (429) | online: switch `BIGNAME_UPSTREAM_RPC_URL`; the cache prevents a repeat |
| every test times out, Anvil exited 133 | public RPC dropped a connection mid-read | restart the stack; offline mode avoids it |
| suite-wide hangs after the laptop slept | Docker/OrbStack hang after sleep | `caffeinate -i` for long runs; restart OrbStack |
| "Couldn't prepare your upgrade" for a moment after a migration | bigname has not indexed the parent's migration yet | wait a second; it clears |
| `/upgrade` bounces to the dashboard | dead PostHog host | start the server with `VITE_PUBLIC_POSTHOG_HOST=https://edge.ens.domains` |
| a wallet with no USDC still shows $10,000 | the dev build mints USDC to the owner on every load | block `/rpc` `mint` and `/wallet/fund` in the test (see B12) |

## History

The stack was assembled on 2026-10-10 on the branch `e2e/bigname-harness`
(local), merged into `e2e-tests-coverage`; see
[`bigname-harness-handoff.md`](./bigname-harness-handoff.md) for that snapshot.
The pinned fork, the caches and offline mode were added on 2026-10-12/13.
