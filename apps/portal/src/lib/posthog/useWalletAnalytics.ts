import { identifyWallet, resetVisitor } from '@ens-apps/utils/analyticsConsent'
import { trackEvent as trackIntercomEvent } from '@intercom/messenger-js-sdk'
import { useConnectionEffect } from 'wagmi'
import posthog from './client'
import { track } from './events'
import { relinkSupportChat } from './supportChat'

/**
 * What a wallet connecting and disconnecting tells PostHog and the support
 * chat. Analytics are non-critical: none of it may crash the app.
 */
export const useWalletAnalytics = (): void => {
  useConnectionEffect({
    onConnect(data) {
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
    },
    onDisconnect() {
      // A new visitor id for whoever uses the browser next; the choice stays.
      try {
        track('wallet:disconnect')
        resetVisitor(posthog)
        relinkSupportChat()
      } catch (error) {
        console.warn('[posthog] reset on disconnect failed', error)
      }
    },
  })
}
