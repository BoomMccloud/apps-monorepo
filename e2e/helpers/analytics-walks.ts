import { NOTICE_STATEMENTS } from '@ens-apps/utils/analyticsNoticeStatements'
import {
  type BrowserContext,
  expect,
  type Locator,
  type Page,
} from '@playwright/test'
import {
  acceptButton,
  analyticsNotice,
  analyticsSwitch,
  browserRequestsSince,
  consentBanner,
  exceptionEventsWith,
  exceptionMessagesOf,
  expectBrowserSilent,
  expectNoPostHogStorage,
  expectPolicyLink,
  expectRecordingsSent,
  FLUSH_TIMEOUT,
  forgetConsent,
  identifiesWallet,
  pageDistinctId,
  policyLink,
  requestText,
  storedConsent,
  throwPageErrors,
  waitForAnalyticsReady,
} from './analytics-consent.js'
import { type PostHogStandIn, TEST_WALLET } from './posthog-stand-in.js'

/**
 * The walks both apps' specs share: the same visitor doing the same things,
 * with each app's own way in (its page, its wallet connection) passed in.
 */

export const DESKTOP = { width: 1280, height: 800 } as const
export const PHONE = { width: 360, height: 780 } as const
export const SEARCHED_NAME = 'nick.eth'
const ERROR_NAME = 'vitalik.eth'

/** Open the app at a path in a tab, and wait for its SDK. */
type OpenPage = (page: Page, path: string) => Promise<void>

/** The notice says everything it must, in the words a reader would look for. */
const expectNoticeSays = async (notice: Locator): Promise<void> => {
  const text = (await notice.textContent()) ?? ''
  for (const [statement, pattern] of NOTICE_STATEMENTS) {
    expect(text, statement).toMatch(pattern)
  }
}

/**
 * The app's menu opens the notice, which shows that nothing is chosen yet and
 * keeps the ENS privacy policy one click away. The banner's own link goes to
 * that policy on ens.domains, so it is checked and not followed.
 */
export const expectNoticeOpenedFromMenu = async ({
  page,
  context,
  open,
  origin,
  startPath,
  openPrivacySettings,
  noticePath,
}: {
  readonly page: Page
  readonly context: BrowserContext
  readonly open: OpenPage
  readonly origin: string
  /** A page that has the app's menu. */
  readonly startPath: string
  /** Open the app's menu and follow its Privacy settings entry. */
  readonly openPrivacySettings: (page: Page) => Promise<void>
  readonly noticePath: string
}): Promise<void> => {
  await forgetConsent(context)
  await open(page, startPath)
  await expectPolicyLink(policyLink(page))
  await openPrivacySettings(page)
  await expect(page).toHaveURL(`${origin}${noticePath}`)

  const notice = analyticsNotice(page)
  await expect(notice).toBeVisible()
  await expectNoticeSays(notice)
  await expect(analyticsSwitch(page)).toBeVisible()
  await expect(analyticsSwitch(page)).not.toBeChecked()
  await expect(notice).toContainText(/not chosen/i)
  // The full policy stays one click away.
  await expectPolicyLink(
    page.getByRole('link', { name: /full privacy policy/i }),
  )
}

/**
 * A pressed button hides the banner for good: through a reload, a wallet
 * connect and disconnect, and another reload.
 */
export const expectChoiceKept = async ({
  page,
  context,
  open,
  press,
  stored,
  connectButton,
  connect,
  disconnect,
}: {
  readonly page: Page
  readonly context: BrowserContext
  readonly open: OpenPage
  readonly press: (page: Page) => Locator
  /** What the shared cookie holds once the button is pressed. */
  readonly stored: string
  readonly connectButton: (page: Page) => Locator
  readonly connect: () => Promise<void>
  readonly disconnect: () => Promise<void>
}): Promise<void> => {
  await forgetConsent(context)
  await open(page, '/')
  await press(page).click()
  await expect(consentBanner(page)).toBeHidden()
  expect(await storedConsent(context)).toBe(stored)

  await page.reload()
  await waitForAnalyticsReady(page)
  await expect(connectButton(page)).toBeVisible()
  await expect(consentBanner(page)).toBeHidden()

  await connect()
  await expect(consentBanner(page)).toBeHidden()

  await disconnect()
  await expect(connectButton(page)).toBeVisible({ timeout: 30_000 })
  await expect(consentBanner(page)).toBeHidden()
  expect(await storedConsent(context)).toBe(stored)

  await page.reload()
  await waitForAnalyticsReady(page)
  await expect(connectButton(page)).toBeVisible()
  await expect(consentBanner(page)).toBeHidden()
  expect(await storedConsent(context)).toBe(stored)
}

/**
 * Error reports after Accept reach PostHog with the address and the .eth name
 * cut out; one thrown before the press never does. No CSP report reaches the
 * host.
 */
export const expectErrorReportsCutDown = async (
  page: Page,
  standIn: PostHogStandIn,
): Promise<void> => {
  await throwPageErrors(page, {
    error: `after-consent-error for ${TEST_WALLET} on ${ERROR_NAME}`,
    rejection: `after-consent-rejection for ${TEST_WALLET} on ${ERROR_NAME}`,
  })
  await expect
    .poll(() => exceptionEventsWith(standIn, 'after-consent-error').length, {
      timeout: FLUSH_TIMEOUT,
    })
    .toBe(1)
  await expect
    .poll(
      () => exceptionEventsWith(standIn, 'after-consent-rejection').length,
      { timeout: FLUSH_TIMEOUT },
    )
    .toBe(1)
  for (const message of exceptionMessagesOf([
    ...exceptionEventsWith(standIn, 'after-consent-error'),
    ...exceptionEventsWith(standIn, 'after-consent-rejection'),
  ])) {
    expect(message.toLowerCase()).not.toContain(TEST_WALLET.toLowerCase())
    expect(message).not.toContain(ERROR_NAME)
  }
  expect(exceptionEventsWith(standIn, 'before-consent')).toEqual([])
  expect(
    standIn
      .browserRequests()
      .filter((request) => /csp|report/i.test(request.path)),
  ).toEqual([])
}

const AUTOCAPTURE_CONTROL_ID = 'autocapture-control'

/**
 * Clicks are being sent in this tab: a button the walk adds to the page and
 * clicks reaches the host as a click. The control the press that declines is
 * measured against, so that its silence cannot be a tab where no click is
 * ever sent.
 */
const expectClicksAreSent = async (
  page: Page,
  standIn: PostHogStandIn,
): Promise<void> => {
  const clickedAt = Date.now()
  await page.evaluate((id) => {
    document.body.insertAdjacentHTML(
      'beforeend',
      `<button id="${id}" type="button" style="position:fixed;top:0;left:0;z-index:2147483647">autocapture control</button>`,
    )
  }, AUTOCAPTURE_CONTROL_ID)
  const control = page.locator(`#${AUTOCAPTURE_CONTROL_ID}`)
  await control.click()
  await expect
    .poll(
      () =>
        browserRequestsSince(standIn, clickedAt)
          .flatMap((request) => request.events)
          .some(
            (event) =>
              event.event === '$autocapture' &&
              JSON.stringify(event.properties).includes(AUTOCAPTURE_CONTROL_ID),
          ),
      { timeout: FLUSH_TIMEOUT },
    )
    .toBe(true)
  await control.evaluate((element) => {
    element.remove()
  })
}

/**
 * Switching to Decline on the notice stops analytics at once: no page view,
 * no click, no error report, nothing about the wallet. Switching back
 * resumes events and recordings.
 */
export const expectNoticeSwitchStopsAndResumes = async ({
  page,
  context,
  standIn,
  open,
  origin,
  noticePath,
  afterDeclinePath,
  resumedPath,
  connect,
}: {
  readonly page: Page
  readonly context: BrowserContext
  readonly standIn: PostHogStandIn
  readonly open: OpenPage
  readonly origin: string
  readonly noticePath: string
  /** A page opened after the Decline, with a query that marks its requests. */
  readonly afterDeclinePath: string
  readonly resumedPath: string
  readonly connect: () => Promise<void>
}): Promise<void> => {
  await forgetConsent(context)
  await page.setViewportSize(DESKTOP)
  await open(page, '/')
  const acceptedAt = Date.now()
  await acceptButton(page).click()
  await connect()
  await expect
    .poll(() => identifiesWallet(standIn, TEST_WALLET), {
      timeout: FLUSH_TIMEOUT,
    })
    .toBe(true)

  await open(page, noticePath)
  const notice = analyticsNotice(page)
  const toggle = analyticsSwitch(page)
  await expect(toggle).toBeChecked()
  await expect(notice).toContainText(/accepted/i)
  // What the Decline stops is running first: clicks and recordings are sent.
  await expectClicksAreSent(page, standIn)
  await expectRecordingsSent(page, standIn, origin, acceptedAt)

  // Decline.
  const pressedAt = Date.now()
  await toggle.click()
  const declinedAt = Date.now()
  await expect(toggle).not.toBeChecked()
  await expect(notice).toContainText(/declined/i)
  expect(await storedConsent(context)).toBe('0')
  await expectNoPostHogStorage(page)
  // The visitor id no longer carries the wallet address.
  expect((await pageDistinctId(page))?.toLowerCase()).not.toBe(
    TEST_WALLET.toLowerCase(),
  )

  // Nothing that happens after the press is sent: no page view, no click, no
  // error report. The press's own click may have been sent before it took
  // effect, so the silence is measured from here.
  const quietFrom = Date.now()
  await throwPageErrors(page, {
    error: 'after-decline-error',
    rejection: 'after-decline-rejection',
  })
  await page.mouse.click(DESKTOP.width / 2, DESKTOP.height / 2)
  await open(page, afterDeclinePath)
  await expectBrowserSilent(page, standIn, quietFrom)
  // PostHog sees the press before the choice takes effect, so the switch is
  // marked as not captured: the press that declines is not sent as a click.
  expect(
    browserRequestsSince(standIn, pressedAt)
      .flatMap((request) => request.events)
      .filter((event) => event.event === '$autocapture'),
    'the press that declines, sent as a click',
  ).toEqual([])
  const sentSinceDecline = browserRequestsSince(standIn, declinedAt)
  expect(
    sentSinceDecline.filter((request) =>
      /after-decline/.test(requestText(request)),
    ),
  ).toEqual([])
  expect(
    sentSinceDecline.filter((request) =>
      requestText(request).toLowerCase().includes(TEST_WALLET.toLowerCase()),
    ),
  ).toEqual([])

  // Switch back: events and recordings resume.
  await open(page, noticePath)
  await expect(analyticsSwitch(page)).not.toBeChecked()
  const resumedAt = Date.now()
  await analyticsSwitch(page).click()
  await expect(analyticsSwitch(page)).toBeChecked()
  await expect(analyticsNotice(page)).toContainText(/accepted/i)
  expect(await storedConsent(context)).toBe('1')
  await open(page, resumedPath)
  await expect
    .poll(
      () =>
        browserRequestsSince(standIn, resumedAt).some((request) =>
          request.events.some((event) => event.event === '$pageview'),
        ),
      { timeout: FLUSH_TIMEOUT },
    )
    .toBe(true)
  await expectRecordingsSent(page, standIn, origin, resumedAt)
}
