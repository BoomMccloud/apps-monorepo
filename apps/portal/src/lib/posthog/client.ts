// The send guard goes first, in the one module that imports the SDK: the SDK
// keeps the `fetch` it finds when it loads, and a production bundle may run a
// shared chunk before the chunk of the entry that imported the guard, so only
// an import here puts the guard before the SDK wherever the bundle puts it.
// Everything else gets the SDK from this module.
import '@ens-apps/utils/analyticsSendGuard'
// The fully-bundled, no-external build, so PostHog never lazy-loads its
// extension bundles (session recorder, surveys, dead-clicks, web-vitals,
// exception autocapture) at runtime. The default `posthog-js` build injects
// those via runtime <script> tags + an inline loader, both of which our strict
// CSP blocks (no 'unsafe-inline'; script-src is host/hash-pinned) — and our
// PostHog reverse proxy (edge.ens.domains) doesn't serve the /static/*.js
// asset paths anyway. Pre-bundling sidesteps both problems. This disables the
// Toolbar (a dev-only feature we don't use in prod). See PostHog's CSP guide:
// https://posthog.com/docs/advanced/content-security-policy
import posthog from 'posthog-js/dist/module.full.no-external'

export default posthog
