import { useQuery, useQueryClient } from '@tanstack/react-query'
import posthog from 'posthog-js/dist/module.full.no-external'
import { useEffect, useRef } from 'react'
import { ALL_SWITCHES_OFF, type FeatureSwitches } from './feature-flags'
import {
  getFeatureSwitchesQueryOptions,
  getKnownFeatureSwitches,
} from './featureSwitches.query'

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
 * being restored, when the answers the page started with still hold. When one
 * wallet gives way to another, the answers decided for the first never stay
 * for the second: the SDK gets those the page already holds for the second,
 * or every switch off until the server has answered, and for good if it
 * cannot.
 */
export const useFeatureSwitchSync = (
  wallet: string | null,
  isConnectionSettled: boolean,
): void => {
  const queryClient = useQueryClient()
  const { data } = useQuery({
    ...getFeatureSwitchesQueryOptions(wallet),
    enabled: isConnectionSettled,
  })
  const settledWallet = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    if (!isConnectionSettled) return
    const previousWallet = settledWallet.current
    settledWallet.current = wallet
    if (previousWallet && previousWallet !== wallet) {
      pushFeatureSwitches(
        getKnownFeatureSwitches(queryClient, wallet) ?? ALL_SWITCHES_OFF,
      )
    }
  }, [wallet, isConnectionSettled, queryClient])

  useEffect(() => {
    if (data) pushFeatureSwitches(data)
  }, [data])
}
