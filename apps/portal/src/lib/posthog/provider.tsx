import {
  acceptAnalytics,
  declineAnalytics,
  identifyWallet,
  resetVisitor,
} from '@ens-apps/utils/analyticsConsent'
import {
  AnalyticsConsentContext,
  type AnalyticsConsentState,
  useWalletIdentity,
} from '@ens-apps/utils/analyticsConsentContext'
import { trackEvent as trackIntercomEvent } from '@intercom/messenger-js-sdk'
import { PostHogProvider } from '@posthog/react'
// @posthog/react types its `client` prop with the `PostHog` type from the
// default `posthog-js` build, which is a *nominally* distinct declaration from
// the no-external build's `PostHog` (private fields make them structurally
// incompatible even though they're the same runtime SDK). Import that type to
// cast our instance at the provider boundary below.
import type { PostHog } from 'posthog-js'
import posthog from 'posthog-js/dist/module.full.no-external'
import { useState } from 'react'
import { useConnection, useConnectionEffect } from 'wagmi'
import { track } from './events'
import { linkSupportChat } from './supportChat'
import { usePostHogStart } from './usePostHogStart'

/**
 * PostHog for the Explorer: analytics only after the visitor accepts, and the
 * visitor's choice for the banner and the notice. The Explorer reads no
 * feature switch, so nothing about a visitor reaches PostHog before Accept.
 */
export const PHProvider = ({
  children,
}: {
  readonly children: React.ReactNode
}): React.ReactNode => {
  const { address, chainId, connector } = useConnection()
  const [consent, setConsent] = useState<AnalyticsConsentState>('unknown')

  usePostHogStart(setConsent)
  useWalletIdentity(
    posthog,
    consent,
    address ? { address, chainId, connectorName: connector?.name } : null,
  )

  useConnectionEffect({
    onConnect(data) {
      // Analytics are non-critical; never let them crash the app.
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
      try {
        track('wallet:disconnect')
        resetVisitor(posthog)
      } catch (error) {
        console.warn('[posthog] reset on disconnect failed', error)
      }
    },
  })

  const accept = () => {
    void acceptAnalytics(posthog, { isDev: import.meta.env.DEV })
    linkSupportChat()
    setConsent('granted')
  }

  const decline = () => {
    declineAnalytics(posthog)
    setConsent('denied')
  }

  return (
    <AnalyticsConsentContext value={{ consent, accept, decline }}>
      {/* Cast bridges the two posthog-js declaration files (see the type
          import note above); the runtime object is the real PostHog SDK. */}
      <PostHogProvider client={posthog as unknown as PostHog}>
        {children}
      </PostHogProvider>
    </AnalyticsConsentContext>
  )
}
