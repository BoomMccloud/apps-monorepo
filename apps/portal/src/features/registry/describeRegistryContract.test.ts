import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import { ensChain } from '@/lib/wagmi'
import { describeRegistryContract } from './describeRegistryContract'

const ETH_REGISTRY = getChainContractAddress({
  chain: ensChain,
  contract: 'ensRegistry',
})
const OTHER = '0x1111111111111111111111111111111111111111' as Address

describe('describeRegistryContract', () => {
  it('names the .eth registry by the deployment address', () => {
    expect(
      describeRegistryContract({ address: ETH_REGISTRY, name: 'eth' }).type,
    ).toBe('Official ENS V2 .eth registry')
  })

  it('names the root registry, which no name points at', () => {
    expect(describeRegistryContract({ address: OTHER, name: '' }).type).toBe(
      'Official ENS V2 root registry',
    )
  })

  it('treats every other indexed registry as a verified permissioned one', () => {
    const description = describeRegistryContract({
      address: OTHER,
      name: 'alice.eth',
    })

    expect(description.type).toBe('Verified ENS V2 permissioned registry')
    expect(description.docsHref).toBe(
      'https://docs.ens.domains/contracts/ensv2/overview/',
    )
  })
})
