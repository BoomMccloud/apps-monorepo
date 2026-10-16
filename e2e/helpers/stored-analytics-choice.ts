import type { BrowserContext } from '@playwright/test'
import { CONSENT_COOKIE_NAME } from './analytics-consent.js'

/**
 * Decline analytics before the first page loads, as a returning visitor
 * would have, so the analytics banner never covers the page under test and
 * nothing reaches PostHog. The analytics consent specs clear it to start as
 * a visitor who has not chosen.
 */
export const storeDeclinedAnalytics = (
  context: BrowserContext,
  appUrl: string,
): Promise<void> =>
  context.addCookies([{ name: CONSENT_COOKIE_NAME, value: '0', url: appUrl }])
