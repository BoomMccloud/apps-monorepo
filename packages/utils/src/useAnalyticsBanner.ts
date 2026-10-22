import { useId } from 'react'
import { ANALYTICS_BANNER, PRIVACY_POLICY_URL } from './analyticsConsentWording'
import { useAnalyticsConsent } from './useAnalyticsConsent'

const PARAGRAPHS = [
  ANALYTICS_BANNER.intro,
  ANALYTICS_BANNER.collected,
  ANALYTICS_BANNER.shared,
] as const

/**
 * What the analytics banner shows and does, for an app to put in its own
 * markup: it is shown only while the visitor has not chosen, and each
 * button passes the visitor's press on. The words are the same in every ENS
 * app (`analyticsConsentWording`).
 */
export const useAnalyticsBanner = () => {
  const { consent, accept, decline } = useAnalyticsConsent()
  const headingId = useId()

  return {
    isShown: consent === 'pending',
    /** Names the banner's region on the page: the id of its heading. */
    headingId,
    heading: ANALYTICS_BANNER.heading,
    paragraphs: PARAGRAPHS,
    accept: { label: ANALYTICS_BANNER.accept, press: accept },
    decline: { label: ANALYTICS_BANNER.decline, press: decline },
    /** The ENS privacy policy, which opens in a new tab. */
    policy: { label: ANALYTICS_BANNER.policyLink, href: PRIVACY_POLICY_URL },
  }
}
