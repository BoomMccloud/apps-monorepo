# Manager

The ENS app for ENSv2: search and register names, renew, migrate names from
ENSv1, edit profiles and records, manage the names an address holds, and
subscribe to expiry and transfer notifications. Deployed by ENS Labs at
https://sepolia.app.ens.domains.

Part of the [ENS apps monorepo](../../README.md); the root README covers
prerequisites, repository-wide commands and conventions.

## Stack

- TanStack Start (React 19, file-based TanStack Router, server rendering on
  Cloudflare Workers through the Cloudflare Vite plugin)
- wagmi and viem, with a custom wallet modal (EIP-6963 discovery plus
  WalletConnect) from [`src/lib/wallet`](src/lib/wallet)
- Rhinestone smart accounts for gas-sponsored registration and migration,
  through [`@ens-apps/smart-account`](../../packages/smart-account) and
  [`@ens-apps/transaction-manager`](../../packages/transaction-manager)
- TanStack Query for server state, XState for multi-step flows, neverthrow for
  errors
- Tailwind CSS 4 with shadcn/Radix components in `src/components/ui`
- Lingui for translations, managed in Crowdin
- Vitest, Testing Library and Storybook

## Running locally

```bash
cp .env.example .env.local # optional overrides
pnpm dev                 # http://localhost:3000
```

The committed defaults target Sepolia and the hosted backend at
`sepolia.app-api.ens.domains`; to run the backend too, see [`workers/api-worker`](../../workers/api-worker).

`VITE_ENS_NETWORK` is required and the build fails without it. Every other
variable is documented inline in [`.env.example`](.env.example). Three of them
are debug-only and must never reach a production deploy:

- `VITE_FF_USE_EOA` skips the smart account and signs every transaction with
  the connected wallet.
- `VITE_USE_MOCK_WALLET` auto-connects wagmi's mock connector for automated
  browsers.
- `VITE_ENABLE_DEBUG_FEATURES` exposes the `/debug/*` routes and the backend
  override. It is on automatically in `vite dev`.

## Environments

`pnpm dev` / `pnpm build` use Sepolia; `pnpm dev:mainnet` / `pnpm build:mainnet`
select mainnet. See [app environment configuration](../../README.md#app-environments)
for env-file layering, local overrides and deployment behavior.

Mainnet requires a Bigname endpoint in the network profile or
`VITE_BIGNAME_API_URL`; validation fails until one is supplied. The mainnet
Telegram bot ID is intentionally empty until provisioned. Configure the new
Worker's domain routing and Rhinestone credentials separately:
`RHINESTONE_JWT_PRIVATE_KEY`, `RHINESTONE_INTEGRATOR_ID`,
`RHINESTONE_PROJECT_ID`, `RHINESTONE_APP_ID`, `RHINESTONE_KEY_ID`.
The mainnet token rate limiter uses a separate namespace.

The feature switches are decided on the server from PostHog's rules
([`src/server/posthog`](src/server/posthog)), the way PostHog's Cloudflare KV example
does it: a scheduled job (every minute, see `wrangler.jsonc`) has PostHog's SDK
fetch the rules and stores them, once they pass a check that every switch can
be decided, in the Worker's own `POSTHOG_SWITCH_RULES` KV namespace, which
`wrangler deploy` provisions; requests only read KV. Each Worker, mainnet
included, needs its own `POSTHOG_PROJECT_SECRET_API_KEY` Worker secret; without
it nothing new is stored, and a Worker that holds no rules has every switch
off. KV persists across deploys, so a Worker has no rules only after its first
deploy, until its job has run once (within a minute); a later deploy keeps the
stored rules. Each run downloads the rules whole, which PostHog counts as [10
flag requests](https://posthog.com/docs/feature-flags/local-evaluation), 14,400
a day per Worker at one run a minute; the mainnet Worker runs the same cron. A preview version
reads the namespace its Worker already has (`wrangler versions upload` inherits
a binding the Worker holds), so it decides from the rules that Worker's job
stored. A dev server and `vite preview` run no cron and keep a namespace of
their own, so every switch is off there until `GET /cdn-cgi/handler/scheduled`
has run the job once by hand. Cloudflare
documents that route, as `/cdn-cgi/local/scheduled`, for local development,
and nothing in the Worker's own code starts a run from a request. `vite build`
checks the live rules against that key in the mode it builds, so a build that
deploys holds the key too (`pnpm check:switch-rules --mode mainnet` runs the
same check by hand).

## Notes

- `pnpm typecheck` builds the api-worker's exported types first.
- `pnpm dev:inspect` runs the dev server with the XState inspector.
- `pnpm cf-typegen` regenerates the Worker bindings after a `wrangler.jsonc` change.
- [`rhinestone-browser-debug/`](rhinestone-browser-debug/README.md) is a
  standalone page for isolating the smart-account flow with a browser wallet.

## Further reading

- [`docs/FEATURE_FLAGS.md`](docs/FEATURE_FLAGS.md): env-var and per-user flags.
- [`docs/I18N.md`](docs/I18N.md): the Lingui and Crowdin workflow.
- [`docs/HCA_MIGRATION_RELEASE_NOTES.md`](docs/HCA_MIGRATION_RELEASE_NOTES.md):
  how migration batches run through the smart account.
- [`packages/transaction-manager/docs/TRANSACTION_FLOW.md`](../../packages/transaction-manager/docs/TRANSACTION_FLOW.md)
  and [`packages/smart-account/DEBUGGING_INTENTS.md`](../../packages/smart-account/DEBUGGING_INTENTS.md)
  before changing anything in the registration or migration batches.
- [`e2e/README.md`](../../e2e/README.md) for the Playwright suites that
  register and migrate names against a local stack.
