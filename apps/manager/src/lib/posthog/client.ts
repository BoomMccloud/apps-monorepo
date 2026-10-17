// The send guard goes first, in the one module that imports the SDK: the SDK
// keeps the `fetch` it finds when it loads, and a production bundle may run a
// shared chunk before the chunk of the entry that imported the guard, so only
// an import here puts the guard before the SDK wherever the bundle puts it.
// Everything else gets the SDK from this module.
import '@ens-apps/utils/analyticsSendGuard'
import { reactClientOf } from '@ens-apps/utils/postHogReactClient'
// Pre-bundled build so PostHog never injects runtime <script> tags that our
// CSP would block. See provider.tsx for the full rationale.
import posthog from 'posthog-js/dist/module.full.no-external'

export default posthog

/** The SDK as @posthog/react's types describe it, for its provider. */
export const reactClient = reactClientOf(posthog)
