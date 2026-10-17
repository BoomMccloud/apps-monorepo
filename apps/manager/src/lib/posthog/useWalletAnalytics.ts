import { identifyWallet, resetVisitor } from '@ens-apps/utils/analyticsConsent'
import { trackEvent as trackIntercomEvent } from '@intercom/messenger-js-sdk'
import { useConnectionEffect } from 'wagmi'
import posthog from './client'
import { track } from './events'

/**
 * What a wallet connecting and disconnecting tells PostHog and the support
 * chat. Analytics are non-critical: none of it may crash the app.
 * `onVisitorReset` runs once the SDK has forgotten the visitor.
 */
export const useWalletAnalytics = (onVisitorReset: () => void): void => {
  useConnectionEffect({
    onConnect(data) {
      try {
        identifyWallet(posthog, {
          address: data.address,
          chainId: data.chainId,
          connectorName: data.connector.name,
        })
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
      // The reset empties the SDK's switches; the sync hook writes the answers
      // for a visitor with no wallet, or every switch off until it has them.
      try {
        track('wallet:disconnect')
        resetVisitor(posthog)
        onVisitorReset()
      } catch (error) {
        console.warn('[posthog] reset on disconnect failed', error)
      }
    },
  })
}
