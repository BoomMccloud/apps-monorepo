import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import type { QueryClient } from '@tanstack/react-query'
import { fromPromise } from 'neverthrow'
import { getFeatureSwitches } from './getFeatureSwitches'

class GetFeatureSwitchesError extends TaggedError('GetFeatureSwitchesError')<{
  readonly cause: unknown
}> {}

/** The server's switch answers for a wallet, or for a visitor with none. */
export const fetchFeatureSwitches = (wallet: string | null) =>
  fromPromise(
    getFeatureSwitches({ data: { wallet } }),
    (cause) => new GetFeatureSwitchesError({ cause }),
  )

/** The rules change rarely; a minute matches the server's refresh. */
const FEATURE_SWITCHES_STALE_TIME_MS = 60_000

export const getFeatureSwitchesQueryOptions = (wallet: string | null) =>
  resultQueryOptions({
    queryKey: qk('posthog', 'feature_switches', { wallet }),
    queryFn: ({ queryKey: [{ wallet }] }) => fetchFeatureSwitches(wallet),
    staleTime: FEATURE_SWITCHES_STALE_TIME_MS,
  })

/** The answers this page already holds for a wallet, or for none. */
export const getKnownFeatureSwitches = (
  queryClient: QueryClient,
  wallet: string | null,
) => queryClient.getQueryData(getFeatureSwitchesQueryOptions(wallet).queryKey)
