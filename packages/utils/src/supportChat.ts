import {
  boot as bootIntercom,
  getVisitorId,
  update as updateIntercom,
} from '@intercom/messenger-js-sdk'
import type { AnalyticsConsentState } from './analyticsConsentContext'

/** The part of PostHog's SDK that ties a support conversation to the visitor. */
export interface SupportChatAnalytics {
  get_distinct_id(): string
  get_session_replay_url(): string
}

type SupportChatOptions = {
  readonly appId: string
  readonly analytics: SupportChatAnalytics
  /** Record the support chat's visitor id against the visitor's analytics. */
  readonly recordSupportChatVisitor: (intercomVisitorId: string) => void
}

/**
 * The support chat of an ENS app. It works whatever the visitor's analytics
 * choice, and is tied to the visitor's analytics only after Accept.
 */
export const createSupportChat = ({
  appId,
  analytics,
  recordSupportChatVisitor,
}: SupportChatOptions) => {
  /** What ties a support conversation to the visitor's analytics. */
  const supportChatLink = () => ({
    posthog_distinct_id: analytics.get_distinct_id(),
    recent_replay: analytics.get_session_replay_url(),
  })

  const recordSupportChatLink = (): void => {
    const intercomVisitorId = getVisitorId()
    if (intercomVisitorId) recordSupportChatVisitor(intercomVisitorId)
  }

  return {
    /** Boot the support chat, tied to the analytics only after Accept. */
    bootSupportChat: (consent: AnalyticsConsentState): void => {
      try {
        const isLinked = consent === 'granted'
        bootIntercom({
          app_id: appId,
          ...(isLinked ? supportChatLink() : {}),
        })
        if (isLinked) recordSupportChatLink()
      } catch (error) {
        // Intercom can throw on blocked domains (403); never let it crash the app.
        console.warn('[intercom] init failed', error)
      }
    },

    /** On Accept: tie the support chat, already booted, to the visitor's analytics. */
    linkSupportChat: (): void => {
      try {
        updateIntercom(supportChatLink())
        recordSupportChatLink()
      } catch (error) {
        console.warn('[intercom] link failed', error)
      }
    },
  }
}
