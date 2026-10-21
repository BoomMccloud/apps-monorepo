import type { Page } from '@playwright/test'
import {
  connectWithHeadlessWallet,
  expect,
  test,
} from '../../../fixtures/playwright.portal.fixture.js'
import {
  acceptButton,
  analyticsNotice,
  browserRequestsSince,
  consentBanner,
  declineButton,
  eventsNamed,
  expectBannerWording,
  expectBrowserSilent,
  expectCardClearOf,
  expectCardInBottomCorner,
  expectCardUnderHeader,
  expectEqualButtons,
  expectEventsSent,
  expectNoPostHogStorage,
  expectNoSendAfterDecline,
  expectNoSidewaysScroll,
  expectNothingSent,
  expectPolicyLink,
  expectRecordingsSent,
  FLUSH_TIMEOUT,
  forgetConsent,
  identifiesWallet,
  keepScreenshot,
  policyLink,
  presentAsVisitorBrowser,
  storedConsent,
  throwPageErrors,
  waitForAnalyticsReady,
} from '../../../helpers/analytics-consent.js'
import {
  DESKTOP,
  expectChoiceKept,
  expectErrorReportsCutDown,
  expectNoticeOpenedFromMenu,
  expectNoticeSwitchStopsAndResumes,
  PHONE,
  SEARCHED_NAME,
} from '../../../helpers/analytics-walks.js'
import {
  type PostHogStandIn,
  STAND_IN_FLAG_RULES,
  STAND_IN_REMOTE_CONFIG,
  startPostHogStandIn,
  TEST_WALLET,
} from '../../../helpers/posthog-stand-in.js'

/**
 * The analytics choice in the Explorer (WEB-1741), checked where a visitor
 * meets it. The Explorer runs against the stand-in host this file starts
 * (`VITE_PUBLIC_POSTHOG_HOST=http://127.0.0.1:4973`).
 */

const PORTAL_APP_URL = process.env.PORTAL_APP_URL ?? 'http://localhost:3001'
const ORIGIN = new URL(PORTAL_APP_URL).origin
// Any resolver address: the page's sidebar holds the Help and Settings menus.
const RESOLVER_PAGE = '/resolver/0x8FADE66B79cC9f707aB26799354482EB93a5B7dD'

const NOTICE_PATH = '/privacy'

let standIn: PostHogStandIn

test.beforeAll(async () => {
  standIn = await startPostHogStandIn({
    rules: STAND_IN_FLAG_RULES,
    remoteConfig: STAND_IN_REMOTE_CONFIG,
  })
})

test.afterAll(async () => {
  await standIn?.close()
})

test.beforeEach(async ({ context }) => {
  standIn.reset()
  await presentAsVisitorBrowser(context)
})

const openFresh = async (page: Page, path = '/'): Promise<void> => {
  await page.goto(`${PORTAL_APP_URL}${path}`)
  await waitForAnalyticsReady(page)
}

const connectButton = (page: Page) =>
  page.getByRole('button', { name: /^Connect( wallet)?$/ }).first()

/**
 * Open the Help menu, which a page with the sidebar has, and follow its
 * Privacy settings entry.
 */
const openPrivacySettings = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: 'Help', exact: true }).click()
  await page.getByRole('link', { name: 'Privacy settings' }).click()
}

const walletMenu = (page: Page) =>
  page.getByRole('button', { name: /^Wallet menu for / }).first()

/**
 * A page load may or may not restore the wallet connection, and the walks
 * disconnect a connected wallet: connect it again when the load did not.
 */
const connectUnlessRestored = async (
  page: Page,
  wallet: Parameters<typeof connectWithHeadlessWallet>[1],
): Promise<void> => {
  // Decide only once the header shows one state or the other: a Connect button
  // that is absent because the header has not rendered is not a restored
  // connection.
  await expect(connectButton(page).or(walletMenu(page)).first()).toBeVisible()
  const isRestored = await connectButton(page)
    .waitFor({ state: 'hidden', timeout: 5_000 })
    .then(
      () => true,
      () => false,
    )
  if (!isRestored) await connectWithHeadlessWallet(page, wallet)
}

/** Search a name from the home page and open it. */
const searchName = async (page: Page, name: string): Promise<void> => {
  const input = page.getByRole('combobox', {
    name: 'Search for a name, wallet, or contract',
  })
  const field = (await input.count())
    ? input
    : page.getByLabel('Search for a name, wallet, or contract')
  await field.first().click()
  await field.first().fill(name)
  await expect(async () => {
    await field.first().press('Enter')
    await expect(page).toHaveURL(new RegExp(name.replace('.', '\\.')), {
      timeout: 3_000,
    })
  }).toPass({ timeout: 30_000 })
}

test.describe('Explorer analytics choice', () => {
  test('C1: a visitor who has not chosen sees the banner, with equal buttons and a link to the privacy policy', async ({
    page,
    context,
  }, testInfo) => {
    await forgetConsent(context)
    await page.setViewportSize(DESKTOP)
    await openFresh(page)

    const banner = consentBanner(page)
    await expect(banner).toBeVisible()
    await expectBannerWording(banner)
    await expectEqualButtons(page)
    await expectCardInBottomCorner(page, banner, 'right')
    await expectCardClearOf(
      banner,
      page.locator('header').first().locator('a, button'),
      'home header at 1280px',
    )
    await expectNoSidewaysScroll(page)
    await keepScreenshot(page, testInfo, 'explorer-banner-1280')

    // On a page with the sidebar, the card leaves its Help and Settings clear.
    await openFresh(page, RESOLVER_PAGE)
    await expect(banner).toBeVisible()
    await expectCardInBottomCorner(page, banner, 'right')
    await expectCardClearOf(
      banner,
      page.getByRole('button', { name: /^(Help|Settings)$/ }),
      'sidebar Help and Settings',
    )
    await expectNoSidewaysScroll(page)
    await keepScreenshot(page, testInfo, 'explorer-banner-sidebar-1280')

    await page.emulateMedia({ colorScheme: 'dark' })
    await openFresh(page)
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    await expect(banner).toBeVisible()
    await keepScreenshot(page, testInfo, 'explorer-banner-1280-dark')

    await page.emulateMedia({ colorScheme: 'light' })
    await page.setViewportSize(PHONE)
    await openFresh(page)
    await expect(banner).toBeVisible()
    await expectEqualButtons(page)
    await expectCardUnderHeader(page, banner, page.locator('header').first())
    await expectCardClearOf(
      banner,
      page.locator('header').first().locator('a, button'),
      'home header at 360px',
    )
    await expectNoSidewaysScroll(page)
    await keepScreenshot(page, testInfo, 'explorer-banner-360')

    await openFresh(page, RESOLVER_PAGE)
    await expect(banner).toBeVisible()
    const mobileHeader = page.locator('header:visible').first()
    await expectCardUnderHeader(page, banner, mobileHeader)
    await expectCardClearOf(
      banner,
      mobileHeader.locator('a, button'),
      'sidebar page header at 360px',
    )
    await expectNoSidewaysScroll(page)

    await page.emulateMedia({ colorScheme: 'dark' })
    await openFresh(page)
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    await expect(banner).toBeVisible()
    await keepScreenshot(page, testInfo, 'explorer-banner-360-dark')
    await page.emulateMedia({ colorScheme: 'light' })

    // The banner's link goes to the ENS privacy policy, which opens in a new
    // tab and is not followed. The notice is on the Privacy settings page,
    // which the Help menu opens inside the Explorer, and the banner stays
    // until the visitor chooses.
    await expectPolicyLink(policyLink(page))
    await page.setViewportSize(DESKTOP)
    await openFresh(page, RESOLVER_PAGE)
    await openPrivacySettings(page)
    await expect(page).toHaveURL(`${ORIGIN}${NOTICE_PATH}`)
    await expect(analyticsNotice(page)).toBeVisible()
    await expect(banner).toBeVisible()
  })

  for (const [button, press, stored] of [
    ['Accept Analytics', acceptButton, '1'],
    ['Decline', declineButton, '0'],
  ] as const) {
    test(`C1: pressing ${button} hides the banner through a reload and a wallet connect and disconnect`, async ({
      page,
      context,
      wallet,
    }) => {
      await expectChoiceKept({
        page,
        context,
        open: openFresh,
        press,
        stored,
        connectButton,
        connect: () => connectWithHeadlessWallet(page, wallet),
        disconnect: () => wallet.changeAccounts([]),
      })
    })
  }

  test('C2: before a choice and after Decline the browser sends PostHog nothing and keeps no PostHog identifier', async ({
    page,
    context,
    wallet,
  }) => {
    test.setTimeout(600_000)
    await forgetConsent(context)

    const walk = async () => {
      await openFresh(page)
      await openFresh(page, NOTICE_PATH)
      await openFresh(page, RESOLVER_PAGE)
      await openFresh(page)
      await connectWithHeadlessWallet(page, wallet)
      await searchName(page, SEARCHED_NAME)
      await openFresh(page)
      await connectUnlessRestored(page, wallet)
      await wallet.changeAccounts([])
      await expect(connectButton(page)).toBeVisible({ timeout: 30_000 })
    }

    // Before any choice. The silence after Decline covers this walk too.
    await walk()
    expectNothingSent(standIn)
    expect(await storedConsent(context)).toBeUndefined()
    await expectNoPostHogStorage(page)

    // After Decline.
    await openFresh(page)
    await declineButton(page).click()
    await expect(consentBanner(page)).toBeHidden()
    await walk()
    await expectBrowserSilent(page, standIn)
    expect(await storedConsent(context)).toBe('0')
    await expectNoPostHogStorage(page)

    // The Explorer has no server of its own asking PostHog anything.
    expect(standIn.serverRequests()).toEqual([])
  })

  test('C3: Accept starts analytics at once, and a wallet connected later identifies the visitor', async ({
    page,
    context,
    wallet,
  }) => {
    test.setTimeout(600_000)
    await forgetConsent(context)
    await page.setViewportSize(DESKTOP)
    await openFresh(page)

    await throwPageErrors(page, {
      error: 'before-consent-error',
      rejection: 'before-consent-rejection',
    })

    const acceptedAt = Date.now()
    await acceptButton(page).click()
    await expect(consentBanner(page)).toBeHidden()
    expect(await storedConsent(context)).toBe('1')
    await expectEventsSent(standIn, ['$pageview'])

    // (a) A wallet connected after Accept identifies the visitor.
    await connectWithHeadlessWallet(page, wallet)
    await expect
      .poll(() => identifiesWallet(standIn, TEST_WALLET), {
        timeout: FLUSH_TIMEOUT,
      })
      .toBe(true)
    await expectEventsSent(standIn, ['wallet:connect'])

    // Clicks, a search, a page change and a full reload.
    await searchName(page, SEARCHED_NAME)
    await page.reload()
    await waitForAnalyticsReady(page)
    await expectEventsSent(standIn, [
      '$autocapture',
      '$pageleave',
      '$web_vitals',
    ])
    expect(eventsNamed(standIn, '$pageview').length).toBeGreaterThan(1)

    await expect
      .poll(
        () =>
          browserRequestsSince(standIn, acceptedAt).some(
            (request) =>
              request.method === 'GET' &&
              request.path.startsWith('/api/surveys'),
          ),
        { timeout: FLUSH_TIMEOUT },
      )
      .toBe(true)
    await expectRecordingsSent(page, standIn, ORIGIN, acceptedAt)

    await expectErrorReportsCutDown(page, standIn)

    // Disconnecting: analytics go on and the choice is still Accept.
    const disconnectedAt = Date.now()
    await openFresh(page)
    await connectUnlessRestored(page, wallet)
    await wallet.changeAccounts([])
    await expect(connectButton(page)).toBeVisible({ timeout: 30_000 })
    expect(await storedConsent(context)).toBe('1')
    await expectEventsSent(standIn, ['wallet:disconnect'])
    await openFresh(page, NOTICE_PATH)
    await expect
      .poll(
        () =>
          browserRequestsSince(standIn, disconnectedAt).some((request) =>
            request.events.some((event) => event.event === '$pageview'),
          ),
        { timeout: FLUSH_TIMEOUT },
      )
      .toBe(true)
  })

  test('C3: Accept with a wallet already connected identifies the visitor at once', async ({
    page,
    context,
    wallet,
  }) => {
    test.setTimeout(300_000)
    await forgetConsent(context)
    await openFresh(page)
    await connectWithHeadlessWallet(page, wallet)
    await expectBrowserSilent(page, standIn)

    await acceptButton(page).click()
    await expect
      .poll(() => identifiesWallet(standIn, TEST_WALLET), {
        timeout: FLUSH_TIMEOUT,
      })
      .toBe(true)
    await expectEventsSent(standIn, ['$pageview'])
  })

  test('C4: switching to Decline on the notice stops analytics at once, and switching back resumes them', async ({
    page,
    context,
    wallet,
  }) => {
    test.setTimeout(600_000)
    await expectNoticeSwitchStopsAndResumes({
      page,
      context,
      standIn,
      open: openFresh,
      origin: ORIGIN,
      noticePath: NOTICE_PATH,
      afterDeclinePath: '/?after-decline',
      resumedPath: '/',
      connect: () => connectWithHeadlessWallet(page, wallet),
    })
  })

  test('C4: after a Decline nothing in flight, waiting to be tried again or sent by a page that closes reaches PostHog, and Accept sends again', async ({
    context,
  }) => {
    test.setTimeout(600_000)
    await expectNoSendAfterDecline({
      context,
      standIn,
      open: openFresh,
      noticePath: NOTICE_PATH,
    })
  })

  test('C5: the notice, opened from the Help menu, says what is collected and why, who processes it, and how to ask for deletion', async ({
    page,
    context,
  }) => {
    await expectNoticeOpenedFromMenu({
      page,
      context,
      open: openFresh,
      origin: ORIGIN,
      startPath: RESOLVER_PAGE,
      openPrivacySettings,
      noticePath: NOTICE_PATH,
    })
  })
})
