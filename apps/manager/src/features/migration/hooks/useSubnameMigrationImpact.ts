import {
  type ClassifiedName,
  readSubnameMigrationImpact,
} from '@ens-apps/migration'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { PublicClient } from 'viem'
import { bigname } from '@/lib/bigname'
import { publicClient } from '@/lib/wagmi'

type Parameters = {
  readonly selectedNames: readonly string[]
  readonly classified: readonly ClassifiedName[]
  readonly renewingNames: readonly string[]
  readonly ownerAddress?: string | null
  readonly managerRestorationNames?: readonly string[]
  readonly enabled: boolean
  readonly prepared: boolean
}

const FRESH_FOR_MS = 60_000

export const useSubnameMigrationImpact = ({
  selectedNames,
  classified,
  renewingNames,
  ownerAddress,
  managerRestorationNames = [],
  enabled,
  prepared,
}: Parameters) => {
  const selected = new Set(selectedNames.map((name) => name.toLowerCase()))
  const migratingNames = [
    ...new Set([
      ...classified
        .filter(
          (name) =>
            name.action === 'migrate' &&
            selected.has(name.domain.name.toLowerCase()),
        )
        .map(({ domain }) => domain.name),
      ...renewingNames.filter((name) => selected.has(name.toLowerCase())),
    ]),
  ].sort()
  const copiedNames = classified
    .filter(
      (name) =>
        name.action === 'copy' && selected.has(name.domain.name.toLowerCase()),
    )
    .map(({ domain }) => domain.name)
    .sort()
  const selectionKey = JSON.stringify({
    selected: [...selected].sort(),
    migratingNames,
    copiedNames,
    renewingNames: [...renewingNames].sort(),
    owner: ownerAddress?.toLowerCase(),
    managers: [...managerRestorationNames].sort(),
    chainId: publicClient.chain.id,
  })
  const ready = enabled && prepared
  const currentSelection = useRef({ key: selectionKey, revision: 0, ready })
  if (
    currentSelection.current.key !== selectionKey ||
    currentSelection.current.ready !== ready
  ) {
    currentSelection.current = {
      key: selectionKey,
      revision: currentSelection.current.revision + 1,
      ready,
    }
  }
  const [acknowledgement, setAcknowledgement] = useState<{
    readonly selectionKey: string
    readonly fingerprint: string
  } | null>(null)
  const query = useQuery({
    queryKey: qk('migration', 'subname_impact', { selectionKey }),
    queryFn: ({ signal }) =>
      readSubnameMigrationImpact({
        indexer: bigname,
        publicClient: publicClient as PublicClient,
        migratingNames,
        copiedNames,
        renewingNames,
        signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]),
      }),
    enabled: enabled && prepared && selected.size > 0,
    staleTime: FRESH_FOR_MS,
    refetchInterval: enabled ? FRESH_FOR_MS : false,
    refetchOnWindowFocus: 'always',
    retry: false,
  })
  // Returning to an earlier selection must not restore a previous checkbox.
  // Rechecking after a focus change also withdraws the old acknowledgement.
  useEffect(() => {
    setAcknowledgement((previous) =>
      query.isFetching || previous?.selectionKey !== selectionKey
        ? null
        : previous,
    )
  }, [selectionKey, query.isFetching])

  const status =
    selected.size === 0
      ? 'idle'
      : !prepared || query.isPending || query.isFetching
        ? 'loading'
        : query.isError
          ? 'error'
          : 'ready'
  const acknowledged =
    acknowledgement !== null &&
    acknowledgement.selectionKey === selectionKey &&
    acknowledgement.fingerprint === query.data?.fingerprint
  const canStart =
    enabled &&
    status === 'ready' &&
    (query.data?.affectedCount === 0 || acknowledged)

  const checkBeforeStart = async (): Promise<boolean> => {
    if (!canStart) return false
    const current = query.data
    const revision = currentSelection.current.revision
    const result = await query.refetch()
    // Re-read immediately before starting, including on a same-plan retry.
    // Changed/failed reads leave the new result visible for another decision.
    return (
      !result.isError &&
      result.data !== undefined &&
      currentSelection.current.key === selectionKey &&
      currentSelection.current.revision === revision &&
      currentSelection.current.ready &&
      result.data.fingerprint === current?.fingerprint
    )
  }

  return {
    status,
    impact: query.data,
    acknowledged,
    canStart,
    checkBeforeStart,
    retry: () => {
      void query.refetch()
    },
    acknowledge: (checked: boolean) => {
      setAcknowledgement(
        checked && status === 'ready' && query.data
          ? { selectionKey, fingerprint: query.data.fingerprint }
          : null,
      )
    },
  }
}

export type SubnameMigrationImpactState = ReturnType<
  typeof useSubnameMigrationImpact
>
