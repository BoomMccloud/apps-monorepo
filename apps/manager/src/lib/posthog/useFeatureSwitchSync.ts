import { useQuery } from '@tanstack/react-query'
import posthog from 'posthog-js/dist/module.full.no-external'
import { useEffect } from 'react'
import type { FeatureSwitches } from './feature-flags'
import { getFeatureSwitchesQueryOptions } from './featureSwitches.query'

/**
 * Put the server's answers into the SDK, replacing every switch it holds,
 * which also tells `useFeatureFlagEnabled`. Needed after each SDK reset too,
 * which empties the switches without telling the hook.
 */
export const pushFeatureSwitches = (switches: FeatureSwitches): void => {
  if (!posthog.__loaded) return
  posthog.updateFlags(switches, undefined, { merge: false })
}

/**
 * Keep the SDK's switches on the server's answers for the wallet connected
 * now, or for a visitor with none. Waits while the wallet connection is
 * being restored, when the answers the page started with still hold.
 */
export const useFeatureSwitchSync = (
  wallet: string | null,
  isConnectionSettled: boolean,
): void => {
  const { data } = useQuery({
    ...getFeatureSwitchesQueryOptions(wallet),
    enabled: isConnectionSettled,
  })
  useEffect(() => {
    if (data) pushFeatureSwitches(data)
  }, [data])
}
