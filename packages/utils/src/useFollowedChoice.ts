import { useEffect, useRef } from 'react'
import {
  type AnalyticsClient,
  type AnalyticsConsent,
  followStoredChoice,
} from './analyticsConsent'

/**
 * Once the SDK has started, follow a choice made in another tab or another
 * ENS app (`followStoredChoice`), and hand each one to the page.
 */
export const useFollowedChoice = (
  client: AnalyticsClient,
  isStarted: boolean,
  isDev: boolean,
  onChange: (consent: AnalyticsConsent) => void,
): void => {
  // The page's latest handler, read when a change arrives, so the follower
  // does not restart each time the page renders a new one.
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })
  useEffect(() => {
    if (!isStarted) return
    return followStoredChoice(client, {
      isDev,
      onChange: (consent) => onChangeRef.current(consent),
    })
  }, [client, isStarted, isDev])
}
