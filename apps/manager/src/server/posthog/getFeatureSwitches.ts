import { isRecord } from '@ens-apps/utils/isRecord'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { createServerFn } from '@tanstack/react-start'
import { match, P } from 'ts-pattern'
import { isAddress } from 'viem'
import { getConnectionCookie } from '@/lib/connection-cookie'
import type { DecidedFeatureSwitches } from '@/lib/posthog/feature-flags'
import { decideFeatureSwitches } from './decideFeatureSwitches'

type FeatureSwitchesInput = {
  /**
   * The wallet to decide for, null for none. When absent, the wallet in the
   * connection cookie. The browser passes it right after a connect, before
   * its write of the cookie has landed.
   */
  readonly wallet?: string | null
}

class InvalidFeatureSwitchesInput extends TaggedError(
  'InvalidFeatureSwitchesInput',
)<{ readonly message: string; readonly cause: unknown }> {}

const invalidInput = () =>
  new InvalidFeatureSwitchesInput({
    message: 'Invalid feature switches input',
    cause: undefined,
  })

const validateFeatureSwitchesInput = (input: unknown): FeatureSwitchesInput => {
  const validated = match(input)
    .with(undefined, () => ({}))
    .with(P.when(isRecord), (record) =>
      match(record.wallet)
        .with(undefined, () => ({}))
        .with(P.union(null, P.string), (wallet) => ({ wallet }))
        .otherwise(() => undefined),
    )
    .otherwise(() => undefined)
  // A server function's validator refuses by throwing, which is what the
  // framework expects of it.
  if (validated === undefined) throw invalidInput()
  return validated
}

/**
 * Decides the switches for a request from the rules stored in KV, and never
 * calls PostHog. `fetchSwitchRules` is the side that does.
 *
 * Every feature switch, decided on the server for one visitor, with the
 * wallet it decided for (null for none), so the page knows whose answers they
 * are. POST, so a wallet passed in rides in the body and never in a logged
 * address.
 */
export const getFeatureSwitches = createServerFn({ method: 'POST' })
  .validator(validateFeatureSwitchesInput)
  .handler(async ({ data }): Promise<DecidedFeatureSwitches> => {
    const requested =
      data.wallet === undefined ? getConnectionCookie() : data.wallet
    const wallet = requested && isAddress(requested) ? requested : null
    const { env } = await import('cloudflare:workers')
    return { wallet, switches: await decideFeatureSwitches(env, wallet) }
  })
