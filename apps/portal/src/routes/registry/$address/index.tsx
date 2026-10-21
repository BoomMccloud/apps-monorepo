import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { GitBranch, ShieldIcon } from 'lucide-react'
import type { Address, Hash } from 'viem'
import { HistoryIcon } from '@/assets/icons'
import {
  ContractAddressValue,
  ContractCounterCard,
  ContractCounterCardContent,
  ContractCounterCards,
  ContractDetailList,
  ContractDetailRow,
  ContractDocsValue,
  ContractTypeValue,
} from '@/components/ContractOverview'
import { EntityBadge } from '@/components/EntityBadge'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { PageHeading } from '@/components/PageHeading'
import {
  countRecentEvents,
  formatRecentEventCount,
} from '@/features/history/countRecentEvents'
import { getRegistryHistoryQueryOptions } from '@/features/registry/components/v2/RegistryHistory'
import { describeRegistryContract } from '@/features/registry/describeRegistryContract'
import {
  getRegistryInfoQueryOptions,
  type RegistryInfo,
} from '@/features/registry/hooks/useRegistry'
import { ensChain } from '@/lib/wagmi'
import { useBlockExplorerTxUrl } from '@/utils/blockExplorer/useBlockExplorerUrl'
import { formatTimestampDate } from '@/utils/formatting/formatTimestamp'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

export const Route = createFileRoute('/registry/$address/')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

const FACTORY_ADDRESS = getChainContractAddress({
  chain: ensChain,
  contract: 'ensVerifiableFactory',
})

function RouteComponent() {
  const { address: addressParam } = Route.useParams()
  const address = addressParam as Address

  const {
    data: registry,
    isLoading,
    error,
  } = useQuery(getRegistryInfoQueryOptions({ address }))
  if (isLoading) return <LoadingSpinner title="Loading registry" />
  if (error)
    return (
      <ErrorMessage
        title="Error loading registry"
        description={error.message}
      />
    )
  if (!registry)
    return (
      <NotFoundMessage
        title="Registry not found"
        description={
          <>
            <strong>{truncateAddress(address, 6, 4)}</strong> is not a known
            registry contract.
          </>
        }
      />
    )

  const { type, docsHref } = describeRegistryContract({
    address,
    name: registry.name,
  })
  const deployedDate = registry.createdAt
    ? formatTimestampDate(registry.createdAt)
    : null

  return (
    <div className="flex flex-col gap-8">
      <PageHeading className="font-serif">Registry contract</PageHeading>

      <ContractDetailList>
        <ContractDetailRow label="Type">
          <ContractTypeValue isVerified>{type}</ContractTypeValue>
        </ContractDetailRow>
        <ContractDetailRow label="Docs">
          <ContractDocsValue href={docsHref} />
        </ContractDetailRow>
        <ContractDetailRow label="Address">
          <ContractAddressValue address={address} />
        </ContractDetailRow>
        <ContractDetailRow label="Factory">
          <EntityBadge
            variant="contract"
            label="registry factory"
            address={FACTORY_ADDRESS}
            className="font-normal"
          >
            {truncateAddress(FACTORY_ADDRESS, 6, 4)}
          </EntityBadge>
        </ContractDetailRow>
        <ContractDetailRow label="Deployed">
          <DeployedBadge
            transactionHash={registry.createdTransactionHash}
            deployedDate={deployedDate}
          />
        </ContractDetailRow>
        <ContractDetailRow label="Used by">
          <UsedByValue registry={registry} />
        </ContractDetailRow>
      </ContractDetailList>

      <ContractCounterCards>
        <ContractCounterCard
          to="/registry/$address/labels"
          params={{ address }}
        >
          <ContractCounterCardContent
            icon={GitBranch}
            label="Labels"
            value={registry.labelCount ?? '—'}
          />
        </ContractCounterCard>
        <ContractCounterCard to="/registry/$address/roles" params={{ address }}>
          <ContractCounterCardContent
            icon={ShieldIcon}
            label="Role holders"
            value={registry.roleCount ?? '—'}
          />
        </ContractCounterCard>
        <ContractCounterCard
          to="/registry/$address/history"
          params={{ address }}
        >
          <ContractCounterCardContent
            icon={HistoryIcon}
            label="Events in last 30 days"
            value={<RecentEventCount address={address} />}
          />
        </ContractCounterCard>
      </ContractCounterCards>
    </div>
  )
}

/** The names pointing at this registry, or how many when the list runs past one page. */
const UsedByValue = ({ registry }: { readonly registry: RegistryInfo }) => {
  const names = registry.referencedBy
    .map((domain) => domain.name)
    .filter((name): name is string => !!name)

  if (names.length === 0)
    return <span className="text-muted-foreground">—</span>
  if (registry.referencedByHasMore) {
    return (
      <span className="font-semi-mono text-sm text-neutral-7">
        {names.length}+ names
      </span>
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      {names.map((name) => (
        <EntityBadge key={name} variant="name" name={name} showAvatar compact>
          {name}
        </EntityBadge>
      ))}
    </div>
  )
}

const RecentEventCount = ({ address }: { readonly address: Address }) => {
  const { data, isLoading, error } = useInfiniteQuery(
    getRegistryHistoryQueryOptions({ address }),
  )
  const page = data?.pages[0]

  if (isLoading) return <span className="text-neutral-4">…</span>
  if (error || !page) return <>—</>

  return (
    <>
      {formatRecentEventCount(
        countRecentEvents({
          timestamps: page.events.map((event) => event.timestamp),
          nowSeconds: Math.floor(Date.now() / 1000),
          hasMore: page.hasNextPage,
        }),
      )}
    </>
  )
}

const DeployedBadge = ({
  transactionHash,
  deployedDate,
}: {
  readonly transactionHash: Hash | null
  readonly deployedDate: string | null
}) => {
  const deploymentTxUrl = useBlockExplorerTxUrl(transactionHash ?? undefined)

  if (!transactionHash)
    return deployedDate ? <span>{deployedDate}</span> : <span>—</span>

  return (
    <EntityBadge
      variant="tx"
      className="font-normal"
      label={deployedDate ?? undefined}
      copyValue={transactionHash}
      etherscanHref={deploymentTxUrl}
    >
      {truncateAddress(transactionHash, 6, 4)}
    </EntityBadge>
  )
}
