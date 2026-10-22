import {
  boot as bootIntercom,
  getVisitorId,
  update as updateIntercom,
} from '@intercom/messenger-js-sdk'
import type { AnalyticsConsentState } from './analyticsConsentContext'
import {
  type CapturingClient,
  createTracker,
  type SharedPostHogEvents,
} from './postHogTrack'

/** The part of PostHog's SDK that ties a support conversation to the visitor. */
interface SupportChatAnalytics extends CapturingClient {
  get_distinct_id(): string
  get_session_replay_url(): string
  get_explicit_consent_status(): 'granted' | 'denied' | 'pending'
}

type SupportChatOptions = {
  readonly appId: string
  readonly analytics: SupportChatAnalytics
}

/**
 * The chat's widget loads a little after the boot, and its visitor id is known
 * only then: ask again this often, this many times.
 */
const VISITOR_ID_POLL_MS = 1_000
const VISITOR_ID_POLL_LIMIT = 30

/**
 * The support chat of an ENS app. It works whatever the visitor's analytics
 * choice, is tied to the visitor's analytics only after Accept, and loses the
 * tie on Decline. It records the chat's visitor id against the visitor's
 * analytics (the `intercom:booted` event) itself.
 */
export const createSupportChat = ({ appId, analytics }: SupportChatOptions) => {
  const { trackWithOptions } = createTracker<SharedPostHogEvents>(analytics)

  const recordSupportChatVisitor = (intercomVisitorId: string): void =>
    trackWithOptions('intercom:booted', undefined, {
      $set: { intercom_visitor_id: intercomVisitorId },
    })

  /** What ties a support conversation to the visitor's analytics. */
  const supportChatLink = () => ({
    posthog_distinct_id: analytics.get_distinct_id(),
    recent_replay: analytics.get_session_replay_url(),
  })

  // The chat visitors already recorded against a visitor of the analytics, so
  // a boot and a link that both ask record one once. This module's own record,
  // read by nothing else (no-mutation).
  const recorded = new Set<string>()

  /**
   * Record the chat's visitor id against the visitor's analytics once the
   * widget has one. Later asks happen only while the visitor has accepted.
   */
  const recordSupportChatLink = (asksLeft = VISITOR_ID_POLL_LIMIT): void => {
    const intercomVisitorId = getVisitorId()
    if (intercomVisitorId) {
      const key = `${analytics.get_distinct_id()} ${intercomVisitorId}`
      if (recorded.has(key)) return
      recorded.add(key)
      recordSupportChatVisitor(intercomVisitorId)
      return
    }
    if (asksLeft === 0) return
    setTimeout(() => {
      if (analytics.get_explicit_consent_status() !== 'granted') return
      try {
        recordSupportChatLink(asksLeft - 1)
      } catch (error) {
        console.warn('[intercom] link failed', error)
      }
    }, VISITOR_ID_POLL_MS)
  }

  /** On Accept: tie the support chat, already booted, to the visitor's analytics. */
  const linkSupportChat = (): void => {
    try {
      updateIntercom(supportChatLink())
      recordSupportChatLink()
    } catch (error) {
      console.warn('[intercom] link failed', error)
    }
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

    linkSupportChat,

    /**
     * After the visitor's id changed (a wallet identified, the visitor
     * forgotten on a disconnect): tie the chat to the new id while the visitor
     * has accepted, so it never holds the id of the visitor before.
     */
    relinkSupportChat: (): void => {
      if (analytics.get_explicit_consent_status() === 'granted') {
        linkSupportChat()
      }
    },

    /**
     * On Decline, here or in another ENS app: blank the tie Accept made, so a
     * support conversation no longer leads to the visitor's recordings. The
     * chat goes on working; Intercom shows a blank attribute as unknown.
     */
    unlinkSupportChat: (): void => {
      try {
        updateIntercom({ posthog_distinct_id: '', recent_replay: '' })
      } catch (error) {
        console.warn('[intercom] unlink failed', error)
      }
    },
  }
}
