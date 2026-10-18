import { err, ok, type Result } from 'neverthrow'
import { PostHog, type PostHogOptions } from 'posthog-node'
import type { FlagDefinitionCacheProvider } from 'posthog-node/experimental'
// By path, not by package name: vite.config.ts loads this module through the
// build check before any workspace package can be resolved.
import {
  fromSync,
  TaggedError,
} from '../../../../../packages/utils/src/neverthrow'

/**
 * Where the rules come from: the project's public key names the project, and
 * a project secret key limited to reading feature flags authorizes the read.
 * The fetch carries nothing about any visitor.
 */
export type SwitchRulesSource = {
  readonly host: string
  readonly projectKey: string
  readonly secretKey: string
}

/** PostHog's rules did not arrive; the message says why, as far as the SDK told. */
class SwitchRulesNotFetched extends TaggedError('SwitchRulesNotFetched')<{
  readonly message: string
  readonly cause: unknown
}> {}

/** `fetchRules` stands in for `fetch`, and `timeoutMs` for the time the SDK is given. */
export type FetchSwitchRulesOptions = {
  readonly fetchRules?: PostHogOptions['fetch']
  readonly timeoutMs?: number
}

/** How long the SDK is given to fetch the rules and hand them over. */
const FETCH_TIMEOUT_MS = 5_000

/** The SDK polls at this interval; a run is over long before the first poll. */
const NO_POLLING_MS = 60 * 60 * 1000

/**
 * Has PostHog's SDK fetch the project's switch rules once and hand them to
 * `provider`, as PostHog's Cloudflare KV example does in its scheduled job:
 * a client with local evaluation on and a provider that fetches, which is
 * asked to wait until the rules have arrived and then shut down. Resolves ok
 * once the SDK handed over rules, whatever the provider made of them.
 *
 * The SDK catches and drops most failures of the fetch, so this reads the
 * outcome from what the SDK does say: the provider was or was not handed
 * rules, and its error event, when it has one (a refused key, a rate limit).
 */
export const fetchSwitchRules = async (
  source: SwitchRulesSource,
  provider: FlagDefinitionCacheProvider,
  options: FetchSwitchRulesOptions = {},
): Promise<Result<void, SwitchRulesNotFetched>> => {
  const handedOver = Promise.withResolvers<true>()
  const complaint = Promise.withResolvers<string>()
  const made = fromSync(
    () =>
      new PostHog(source.projectKey, {
        host: source.host,
        // posthog-node 5.21 calls the project secret key its personal API
        // key; from 5.40 it is `secretKey`.
        personalApiKey: source.secretKey,
        enableLocalEvaluation: true,
        featureFlagsPollingInterval: NO_POLLING_MS,
        flagDefinitionCacheProvider: {
          ...provider,
          onFlagDefinitionsReceived: async (rules) => {
            handedOver.resolve(true)
            await provider.onFlagDefinitionsReceived(rules)
          },
        },
        fetch: options.fetchRules,
      }),
    (cause) =>
      new SwitchRulesNotFetched({
        message: 'the PostHog client could not be made',
        cause,
      }),
  )
  if (made.isErr()) return err(made.error)

  const client = made.value
  client.on('error', (error: unknown) => complaint.resolve(String(error)))
  await client.waitForLocalEvaluationReady(
    options.timeoutMs ?? FETCH_TIMEOUT_MS,
  )
  await client.shutdown()

  const hasArrived = await Promise.race([
    handedOver.promise,
    Promise.resolve(false),
  ])
  if (hasArrived) return ok(undefined)
  const said = await Promise.race([complaint.promise, Promise.resolve('')])
  return err(
    new SwitchRulesNotFetched({
      message: said
        ? `PostHog sent no switch rules: ${said}`
        : 'PostHog sent no switch rules',
      cause: undefined,
    }),
  )
}
