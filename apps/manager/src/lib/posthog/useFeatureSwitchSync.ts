import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import type { Address } from 'viem'
import posthog from './client'
import {
  ALL_SWITCHES_OFF,
  type DecidedFeatureSwitches,
  type FeatureSwitches,
} from './feature-flags'
import { getFeatureSwitchesQueryOptions } from './featureSwitches.query'

/**
 * Put the answers into the SDK, replacing every switch it holds, which also
 * tells `useFeatureFlagEnabled`. Says whether the SDK took them: it takes none
 * before it has started. Not exported: this module is the one place that
 * writes the SDK's switches.
 */
const writeFeatureSwitches = (switches: FeatureSwitches): boolean => {
  if (!posthog.__loaded) return false
  posthog.updateFlags(switches, undefined, { merge: false })
  return true
}

/** What the SDK holds from this hook: none of the switches before a first write and after a reset. */
type Written = { readonly switches?: FeatureSwitches }

export type FeatureSwitchSyncInput = {
  /** The wallet connected now, or null for none. */
  readonly wallet: Address | null
  /** Whether wagmi has finished restoring the stored connection. */
  readonly isConnectionSettled: boolean
  /** The answers the server rendered the page with, and the wallet they were decided for. */
  readonly pageStart: DecidedFeatureSwitches
}

/**
 * Keep the SDK's switches on the answers known for the wallet connected now:
 * the server's, or every switch off while it has not answered for that wallet
 * and for good if it cannot. No caller writes the SDK's switches itself, so
 * none can leave one wallet's answers for another: a change of wallet, an
 * answer arriving and a reset all come through here. The answers the page
 * started with are known answers for the wallet they were decided for, and
 * hold while wagmi is still restoring the connection.
 *
 * Returns what to call once the SDK has been reset. A reset empties the SDK's
 * switches without telling the page, so the hook forgets what it wrote and
 * writes the answers known at the next render again. The same function every
 * time: wagmi's connection watcher is set up again when its handlers change.
 */
export const useFeatureSwitchSync = ({
  wallet,
  isConnectionSettled,
  pageStart,
}: FeatureSwitchSyncInput): (() => void) => {
  const { data } = useQuery(
    getFeatureSwitchesQueryOptions({
      wallet,
      isEnabled: isConnectionSettled,
      initialSwitches:
        wallet === pageStart.wallet ? pageStart.switches : undefined,
    }),
  )
  // A reset sets a new record, so that the effect sees it whether or not
  // anything had been written before.
  const [written, setWritten] = useState<Written>({})

  useEffect(() => {
    if (!isConnectionSettled) return
    // greptile: query-data-unwrapped: loading, an error and no data all mean
    // the same here, every switch off, so the three states are not told apart.
    const answers = data ?? ALL_SWITCHES_OFF
    if (answers === written.switches) return
    if (writeFeatureSwitches(answers)) setWritten({ switches: answers })
  }, [data, isConnectionSettled, written])

  return useCallback(() => setWritten({}), [])
}
