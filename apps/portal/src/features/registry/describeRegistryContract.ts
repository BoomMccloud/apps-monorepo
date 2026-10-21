import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { type Address, isAddressEqual } from 'viem'
import { CONTRACT_DOCS } from '@/lib/constants/contractDocs'
import { ensChain } from '@/lib/wagmi'

// ensjs's `ensRegistry` is the registry that holds .eth names, not the root.
const ETH_REGISTRY = getChainContractAddress({
  chain: ensChain,
  contract: 'ensRegistry',
})

export type RegistryContractDescription = {
  readonly type: string
  readonly docsHref: string
}

/** The Type row: bigname gives the root no name, the .eth registry is the deployment's `ensRegistry`, the rest come from the factory. */
export const describeRegistryContract = ({
  address,
  name,
}: {
  readonly address: Address
  readonly name: string
}): RegistryContractDescription => ({
  type: isAddressEqual(address, ETH_REGISTRY)
    ? 'Official ENS V2 .eth registry'
    : name === ''
      ? 'Official ENS V2 root registry'
      : 'Verified ENS V2 permissioned registry',
  docsHref: CONTRACT_DOCS.registry,
})
