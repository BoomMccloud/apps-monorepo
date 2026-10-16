import handler from '@tanstack/react-start/server-entry'
import { refreshSwitchRules } from '@/lib/posthog/refreshSwitchRules'

/**
 * The Manager's Worker. TanStack Start answers every request; the scheduled
 * job keeps PostHog's feature-switch rules fresh in KV for those requests to
 * read (the cron is in wrangler.jsonc). A refresh that fails throws, so the
 * failed run shows in the Worker's logs.
 */
export default {
  // The request context starts empty; the request middleware fills it
  // (start.ts), as with the framework's default entry.
  fetch: (request) => handler.fetch(request, { context: {} }),
  scheduled: async (_controller, env) => {
    await refreshSwitchRules(env)
  },
} satisfies ExportedHandler<Env>
