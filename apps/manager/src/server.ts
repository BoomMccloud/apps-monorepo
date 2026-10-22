import handler, { createServerEntry } from '@tanstack/react-start/server-entry'
import type { SwitchRulesEnv } from '@/server/posthog/decideFeatureSwitches'
import { refreshSwitchRules } from '@/server/posthog/refreshSwitchRules'

/**
 * The cron's run. A refresh that fails is thrown here, once, so the failed
 * run shows in the Worker's logs. The job is awaited, not handed to
 * `ctx.waitUntil`, since a failure inside that could not fail the run.
 */
const refreshOnSchedule = async (
  _controller: ScheduledController,
  env: SwitchRulesEnv,
): Promise<void> => {
  const refreshed = await refreshSwitchRules(env)
  // greptile: no-manual-result-unwrap-throw: the Result is thrown here, at the
  // entry point, and nowhere else. The Workers runtime counts a `scheduled`
  // handler that resolves as a good run and learns of a failed one only from
  // a rejection, so the Result cannot be chained or returned past this
  // handler.
  refreshed.match(
    () => undefined,
    (failure) => {
      throw failure
    },
  )
}

// TanStack Start's own wrapper for the entry's `fetch`, as its guide has it.
const serverEntry = createServerEntry({
  fetch(request, opts) {
    return handler.fetch(request, opts)
  },
})

/**
 * The Manager's Worker. TanStack Start answers every request; the scheduled
 * job keeps PostHog's feature-switch rules fresh in KV for those requests to
 * read (the cron is in wrangler.jsonc).
 */
export default {
  // A Worker's `fetch` is called with its bindings and its context after the
  // request, not with Start's request options, so Start is given the empty
  // context it starts every request with (start.ts registers a request
  // context, which makes the options' `context` required); the request
  // middleware fills it, as with the framework's default entry.
  fetch: (request: Request) => serverEntry.fetch(request, { context: {} }),
  scheduled: refreshOnSchedule,
} satisfies ExportedHandler<Cloudflare.Env>
