import { trackEvent as trackIntercomEvent } from '@intercom/messenger-js-sdk'
import { useCallback, useEffect, useRef } from 'react'
import type { Address } from 'viem'
import { identifyWallet, resetVisitor } from './analyticsConsent'
import posthog from './postHogClient'
import { createTracker, type SharedPostHogEvents } from './postHogTrack'

const { track } = createTracker<SharedPostHogEvents>(posthog)

/** A wallet connecting, as wagmi's `onConnect` hands it over. */
type ConnectionEvent = {
  readonly address: Address
  readonly chainId: number
  readonly connector: { readonly name: string }
}

/**
 * The hooks of wagmi that the analytics read the wallet with. The app passes
 * its own: this package holds no copy of wagmi, because a second copy would
 * keep its own context and never find the app's `WagmiProvider`.
 */
export type WagmiHooks = {
  readonly useConnection: () => {
    readonly address?: Address | undefined
    readonly chainId?: number | undefined
    readonly connector?: { readonly name: string } | undefined
    readonly status:
      | 'connecting'
      | 'reconnecting'
      | 'connected'
      | 'disconnected'
  }
  readonly useConnectionEffect: (callbacks: {
    readonly onConnect?: (event: ConnectionEvent) => void
    readonly onDisconnect?: () => void
  }) => void
}

type WalletAnalyticsOptions = {
  readonly wagmi: Pick<WagmiHooks, 'useConnectionEffect'>
  /** Ties the support chat to the visitor's new id, while the visitor has accepted. */
  readonly relinkSupportChat: () => void
  /** Runs once the SDK has forgotten the visitor, on a disconnect. */
  readonly onVisitorReset?: () => void
}

/**
 * What a wallet connecting and disconnecting tells PostHog and the support
 * chat. Analytics are non-critical: none of it may crash the app.
 */
export const useWalletAnalytics = ({
  wagmi,
  relinkSupportChat,
  onVisitorReset,
}: WalletAnalyticsOptions): void => {
  // The page's latest callbacks, read when a wallet connects or disconnects.
  // wagmi lists both handlers below as the dependencies of the effect that
  // watches the connection, which new ones would set up again on every render
  // of the page, so they never depend on what the page passes in.
  const callbacks = useRef({ relinkSupportChat, onVisitorReset })
  useEffect(() => {
    callbacks.current = { relinkSupportChat, onVisitorReset }
  })

  const onConnect = useCallback((event: ConnectionEvent) => {
    try {
      identifyWallet(posthog, {
        address: event.address,
        chainId: event.chainId,
        connectorName: event.connector.name,
      })
      callbacks.current.relinkSupportChat()
      track('wallet:connect', {
        wallet_address: event.address,
        chain_id: event.chainId,
        wallet_connector: event.connector.name,
      })
    } catch (error) {
      console.warn('[posthog] wallet:connect failed', error)
    }

    try {
      trackIntercomEvent('wallet:connect', {
        wallet_address: event.address,
        chain_id: event.chainId,
        wallet_connector: event.connector.name,
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
      callbacks.current.relinkSupportChat()
      callbacks.current.onVisitorReset?.()
    } catch (error) {
      console.warn('[posthog] reset on disconnect failed', error)
    }
  }, [])

  wagmi.useConnectionEffect({ onConnect, onDisconnect })
}
