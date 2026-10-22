import { useQuery } from '@tanstack/react-query'
import { RegistryRolesNotice } from '@/features/profile/components/common/RegistryRolesNotice'
import { profileRegistryAccessQuery } from '@/features/profile/service/profileRegistryAccess'
import { resolverWriteAccessQuery } from '@/features/profile/service/resolverWriteAccess'
import type { RenewalProtocol } from '@/features/renew/utils/renewalProtocol'
import { useSmartAccountContext } from '@/lib/smart-account'

/** Only explain a confirmed permission restriction, never a pending or failed read. */
export const ProfileRegistryRolesNotice = ({
  name,
  isOwner,
  protocol,
  isInGrace,
  isExpiryError,
  isUpgradeRequired,
}: {
  readonly name: string
  readonly isOwner: boolean | undefined
  readonly protocol: RenewalProtocol | undefined
  readonly isInGrace: boolean
  readonly isExpiryError: boolean
  readonly isUpgradeRequired: boolean
}) => {
  const { isConnected, ownerAddress } = useSmartAccountContext()
  const address = ownerAddress ?? undefined
  const canCheckAccess =
    isConnected &&
    Boolean(address) &&
    isOwner === false &&
    protocol === 'v2' &&
    !isInGrace &&
    !isExpiryError &&
    !isUpgradeRequired
  // Shares the editor's cached permission probe; no additional RPC call.
  const resolverAccess = useQuery({
    ...resolverWriteAccessQuery(name, address),
    enabled: canCheckAccess,
  })
  const registryAccess = useQuery({
    ...profileRegistryAccessQuery(name, address),
    enabled: canCheckAccess && resolverAccess.data === false,
  })

  if (
    !canCheckAccess ||
    !resolverAccess.isSuccess ||
    resolverAccess.data !== false ||
    !registryAccess.isSuccess ||
    registryAccess.data !== true
  )
    return null

  return (
    <div className="mx-5 mt-6 rounded-lg border border-ens-quartz-250 p-4 xl:mx-8">
      <RegistryRolesNotice isEditingRestricted name={name} />
    </div>
  )
}
