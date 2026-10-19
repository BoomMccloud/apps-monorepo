// greptile: file-naming-conventions: the Manager names the file of a query
// factory `<name>.query.ts`, as the nine files under
// features/register-v2/data/queries do; the rule's list of names has none for
// a query file.
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import type { FeatureSwitches } from './feature-flags'
import { getFeatureSwitches } from './getFeatureSwitches'

class GetFeatureSwitchesError extends TaggedError('GetFeatureSwitchesError')<{
  readonly cause: unknown
}> {}

/** The server's switch answers for a wallet, or for a visitor with none. */
const fetchFeatureSwitches = ResultFn(async function* (wallet: Address | null) {
  const { switches } = yield* fromPromise(
    getFeatureSwitches({ data: { wallet } }),
    (cause) => new GetFeatureSwitchesError({ cause }),
  )
  return ok(switches)
})

/** The rules change rarely; a minute matches the server's refresh. */
const FEATURE_SWITCHES_STALE_TIME_MS = 60_000

type GetFeatureSwitchesParameters = {
  readonly wallet: Address | null
  /** Whether the query may run: not before wagmi has restored the connection. */
  readonly isEnabled: boolean
  /** The answers the page was rendered with, when they were decided for this wallet. */
  readonly initialSwitches: FeatureSwitches | undefined
}

export const getFeatureSwitchesQueryOptions = ({
  wallet,
  isEnabled,
  initialSwitches,
}: GetFeatureSwitchesParameters) =>
  resultQueryOptions({
    queryKey: qk('posthog', 'feature_switches', { wallet }),
    queryFn: ({ queryKey: [{ wallet }] }) => fetchFeatureSwitches(wallet),
    enabled: isEnabled,
    initialData: initialSwitches,
    staleTime: FEATURE_SWITCHES_STALE_TIME_MS,
  })
