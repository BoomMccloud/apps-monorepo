import { useId } from 'react'
import { NOT_CAPTURED_CLASS } from './analyticsConsent'
import {
  ANALYTICS_CHOICE_STATUS,
  ANALYTICS_NOTICE_HEADING,
  ANALYTICS_NOTICE_INTRO,
  ANALYTICS_NOTICE_SECTIONS,
  ANALYTICS_SWITCH_LABEL,
} from './analyticsConsentWording'
import { useAnalyticsConsent } from './useAnalyticsConsent'

/**
 * What the analytics notice shows and does, for an app to put in its own
 * markup: what is collected, the switch that shows and changes the visitor's
 * choice, and the choice in words. The switch cannot be used before the SDK
 * has started, when there is no choice to show. The words are the same in
 * every ENS app (`analyticsConsentWording`).
 */
export const useAnalyticsNotice = () => {
  const { consent, accept, decline } = useAnalyticsConsent()
  const headingId = useId()
  const switchId = useId()

  return {
    /** Names the notice's region on the page: the id of its heading. */
    headingId,
    heading: ANALYTICS_NOTICE_HEADING,
    intro: ANALYTICS_NOTICE_INTRO,
    sections: ANALYTICS_NOTICE_SECTIONS,
    switch: {
      id: switchId,
      label: ANALYTICS_SWITCH_LABEL,
      isOn: consent === 'granted',
      isDisabled: consent === 'unknown',
      /** The class the switch's wrapper has, so that the press that declines is not captured as a click. */
      wrapperClass: NOT_CAPTURED_CLASS,
      change: (isOn: boolean): void => (isOn ? accept() : decline()),
    },
    /** The visitor's choice in words; nothing before the SDK has started. */
    status: consent === 'unknown' ? null : ANALYTICS_CHOICE_STATUS[consent],
  }
}
