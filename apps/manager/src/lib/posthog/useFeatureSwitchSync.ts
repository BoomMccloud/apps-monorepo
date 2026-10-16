import { useQuery } from '@tanstack/react-query'
import posthog from 'posthog-js/dist/module.full.no-external'
import { useEffect } from 'react'
import {
  ALL_SWITCHES_OFF,
  type DecidedFeatureSwitches,
  type FeatureSwitches,
} from './feature-flags'
import { getFeatureSwitchesQueryOptions } from './featureSwitches.query'

/**
 * Put the answers into the SDK, replacing every switch it holds, which also
 * tells `useFeatureFlagEnabled`. Not exported: this module is the one place
 * that writes the SDK's switches.
 */
const writeFeatureSwitches = (switches: FeatureSwitches): void => {
  if (!posthog.__loaded) return
  posthog.updateFlags(switches, undefined, { merge: false })
}

export type FeatureSwitchSyncInput = {
  /** The wallet connected now, or null for none. */
  readonly wallet: string | null
  /** Whether wagmi has finished restoring the stored connection. */
  readonly isConnectionSettled: boolean
  /** The answers the server rendered the page with, and the wallet they were decided for. */
  readonly pageStart: DecidedFeatureSwitches
  /** How many times the SDK has been reset; each reset empties its switches without telling the page. */
  readonly resetCount: number
}

/**
 * Keep the SDK's switches on the answers known for the wallet connected now:
 * the server's, or every switch off while it has not answered for that wallet
 * and for good if it cannot. No caller writes the SDK's switches itself, so
 * none can leave one wallet's answers for another: a change of wallet, an
 * answer arriving and a reset all come through here. The answers the page
 * started with are known answers for the wallet they were decided for, and
 * hold while wagmi is still restoring the connection.
 */
export const useFeatureSwitchSync = ({
  wallet,
  isConnectionSettled,
  pageStart,
  resetCount,
}: FeatureSwitchSyncInput): void => {
  const { data } = useQuery({
    ...getFeatureSwitchesQueryOptions(wallet),
    enabled: isConnectionSettled,
    initialData: wallet === pageStart.wallet ? pageStart.switches : undefined,
  })

  // biome-ignore lint/correctness/useExhaustiveDependencies: `resetCount` writes the answers again after a reset, which empties the SDK's switches though `data` has not changed
  useEffect(() => {
    if (!isConnectionSettled) return
    writeFeatureSwitches(data ?? ALL_SWITCHES_OFF)
  }, [data, isConnectionSettled, resetCount])
}
