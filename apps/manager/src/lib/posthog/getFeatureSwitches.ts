import { createServerFn } from '@tanstack/react-start'
import { isAddress } from 'viem'
import { getConnectionCookie } from '@/lib/connection-cookie'
import { decideFeatureSwitches } from './decideFeatureSwitches'
import type { DecidedFeatureSwitches } from './feature-flags'

export type FeatureSwitchesInput = {
  /**
   * The wallet to decide for, null for none. When absent, the wallet in the
   * connection cookie. The browser passes it right after a connect, before
   * its write of the cookie has landed.
   */
  readonly wallet?: string | null
}

const invalidInput = () => new Error('Invalid feature switches input')

const validateFeatureSwitchesInput = (input: unknown): FeatureSwitchesInput => {
  if (input === undefined) return {}
  if (typeof input !== 'object' || input === null) throw invalidInput()
  if (!('wallet' in input) || input.wallet === undefined) return {}
  if (input.wallet === null || typeof input.wallet === 'string') {
    return { wallet: input.wallet }
  }
  throw invalidInput()
}

/**
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
