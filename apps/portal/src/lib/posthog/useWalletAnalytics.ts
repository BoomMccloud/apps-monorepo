import { identifyWallet, resetVisitor } from '@ens-apps/utils/analyticsConsent'
import { trackEvent as trackIntercomEvent } from '@intercom/messenger-js-sdk'
import { useCallback } from 'react'
import { type UseConnectionEffectParameters, useConnectionEffect } from 'wagmi'
import posthog from './client'
import { track } from './events'
import { relinkSupportChat } from './supportChat'

type ConnectedWallet = Parameters<
  NonNullable<UseConnectionEffectParameters['onConnect']>
>[0]

/**
 * What a wallet connecting and disconnecting tells PostHog and the support
 * chat. Analytics are non-critical: none of it may crash the app.
 */
export const useWalletAnalytics = (): void => {
  // Memoized because wagmi lists both handlers as the dependencies of the
  // effect that watches the connection, which new ones would set up again on
  // every render of the provider.
  const onConnect = useCallback((data: ConnectedWallet) => {
    try {
      identifyWallet(posthog, {
        address: data.address,
        chainId: data.chainId,
        connectorName: data.connector.name,
      })
      relinkSupportChat()
      track('wallet:connect', {
        wallet_address: data.address,
        chain_id: data.chainId,
        wallet_connector: data.connector.name,
      })
    } catch (error) {
      console.warn('[posthog] wallet:connect failed', error)
    }

    try {
      trackIntercomEvent('wallet:connect', {
        wallet_address: data.address,
        chain_id: data.chainId,
        wallet_connector: data.connector.name,
      })
    } catch (error) {
      console.warn('[intercom] wallet:connect failed', error)
    }
  }, [])

  const onDisconnect = useCallback(() => {
    // A new visitor id for whoever uses the browser next; the choice stays.
    try {
      track('wallet:disconnect')
      resetVisitor(posthog)
      relinkSupportChat()
    } catch (error) {
      console.warn('[posthog] reset on disconnect failed', error)
    }
  }, [])

  useConnectionEffect({ onConnect, onDisconnect })
}
