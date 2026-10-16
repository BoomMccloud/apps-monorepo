import type { AnalyticsConsentState } from '@ens-apps/utils/analyticsConsentContext'
import {
  boot as bootIntercom,
  getVisitorId,
  update as updateIntercom,
} from '@intercom/messenger-js-sdk'
import posthog from 'posthog-js/dist/module.full.no-external'
import { INTERCOM_APP_ID } from '@/lib/intercom'
import { trackWithOptions } from './events'

/** What ties a support conversation to the visitor's analytics. */
const supportChatLink = () => ({
  posthog_distinct_id: posthog.get_distinct_id(),
  recent_replay: posthog.get_session_replay_url(),
})

const recordSupportChatLink = (): void => {
  const intercomVisitorId = getVisitorId()
  if (intercomVisitorId) {
    trackWithOptions('intercom:booted', undefined, {
      $set: { intercom_visitor_id: intercomVisitorId },
    })
  }
}

/**
 * Boot the support chat, which works whatever the choice. It is tied to the
 * visitor's analytics only after Accept.
 */
export const bootSupportChat = (consent: AnalyticsConsentState): void => {
  try {
    const isLinked = consent === 'granted'
    bootIntercom({
      app_id: INTERCOM_APP_ID,
      ...(isLinked ? supportChatLink() : {}),
    })
    if (isLinked) recordSupportChatLink()
  } catch (error) {
    // Intercom can throw on blocked domains (403); never let it crash the app.
    console.warn('[intercom] init failed', error)
  }
}

/** On Accept: tie the support chat, already booted, to the visitor's analytics. */
export const linkSupportChat = (): void => {
  try {
    updateIntercom(supportChatLink())
    recordSupportChatLink()
  } catch (error) {
    console.warn('[intercom] link failed', error)
  }
}
