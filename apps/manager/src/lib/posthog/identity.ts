import posthog from 'posthog-js/dist/module.full.no-external'

export type ConnectedWallet = {
  readonly address: string
  readonly chainId: number | undefined
  readonly connectorName: string | undefined
}

/**
 * After Accept, the visitor is their wallet: their visitor id becomes the
 * address and their events carry the wallet's details. Does nothing before
 * Accept, when the SDK would hold the address in memory only to drop it.
 */
export const identifyWallet = (wallet: ConnectedWallet): void => {
  if (posthog.get_explicit_consent_status() !== 'granted') return
  if (posthog.get_distinct_id() !== wallet.address) {
    posthog.identify(
      wallet.address,
      { address: wallet.address },
      { initial_address: wallet.address },
    )
  }
  posthog.register({
    wallet_address: wallet.address,
    chain_id: wallet.chainId,
    wallet_connector: wallet.connectorName,
  })
}
