import handler from '@tanstack/react-start/server-entry'
import type { SwitchRulesEnv } from '@/lib/posthog/decideFeatureSwitches'
import { refreshSwitchRules } from '@/lib/posthog/refreshSwitchRules'

/**
 * The cron's run. A refresh that fails is thrown here, once, so the failed
 * run shows in the Worker's logs.
 */
const refreshOnSchedule = async (
  _controller: ScheduledController,
  env: SwitchRulesEnv,
): Promise<void> => {
  const refreshed = await refreshSwitchRules(env)
  refreshed.match(
    () => undefined,
    (failure) => {
      throw failure
    },
  )
}

/**
 * The Manager's Worker. TanStack Start answers every request; the scheduled
 * job keeps PostHog's feature-switch rules fresh in KV for those requests to
 * read (the cron is in wrangler.jsonc).
 */
export default {
  // The request context starts empty; the request middleware fills it
  // (start.ts), as with the framework's default entry.
  fetch: (request) => handler.fetch(request, { context: {} }),
  scheduled: refreshOnSchedule,
} satisfies ExportedHandler<Cloudflare.Env>
