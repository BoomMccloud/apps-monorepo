import type { Page } from '@playwright/test'
import {
  connectWithHeadlessWallet,
  expect,
  test,
} from '../../../fixtures/playwright.portal.fixture.js'
import {
  acceptButton,
  analyticsNotice,
  analyticsSwitch,
  browserRequestsSince,
  consentBanner,
  declineButton,
  eventsNamed,
  exceptionEventsWith,
  exceptionMessagesOf,
  expectBannerWording,
  expectBrowserSilent,
  expectCardClearOf,
  expectCardInBottomCorner,
  expectCardUnderHeader,
  expectEqualButtons,
  expectEventsSent,
  expectNoPostHogStorage,
  expectNoSidewaysScroll,
  expectRecordingsWhereBuilt,
  FLUSH_TIMEOUT,
  forgetConsent,
  identifiesWallet,
  keepScreenshot,
  pageDistinctId,
  QUIET_PERIOD,
  requestText,
  storedConsent,
  throwPageErrors,
  waitForAnalyticsReady,
} from '../../../helpers/analytics-consent.js'
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
const DESKTOP = { width: 1280, height: 800 }
const PHONE = { width: 360, height: 780 }
const SEARCHED_NAME = 'nick.eth'
const ERROR_NAME = 'vitalik.eth'
const FULL_POLICY = 'https://app.ens.domains/legal/privacy-policy'
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

test.beforeEach(() => {
  standIn.reset()
})

const openFresh = async (page: Page, path = '/'): Promise<void> => {
  await page.goto(`${PORTAL_APP_URL}${path}`)
  await waitForAnalyticsReady(page)
}

const connectButton = (page: Page) =>
  page.getByRole('button', { name: /^Connect( wallet)?$/ }).first()

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
  test('C1: a visitor who has not chosen sees the banner, with equal buttons and a link to the notice', async ({
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

    // The link opens the notice inside the Explorer, and the banner stays
    // until the visitor chooses.
    await banner.getByRole('link', { name: 'Privacy notice' }).click()
    await expect(page).toHaveURL(`${ORIGIN}${NOTICE_PATH}`)
    await expect(analyticsNotice(page)).toBeVisible()
    await expect(banner).toBeVisible()
  })

  for (const [button, stored] of [
    ['Accept Analytics', '1'],
    ['Decline', '0'],
  ] as const) {
    test(`C1: pressing ${button} hides the banner through a reload and a wallet connect and disconnect`, async ({
      page,
      context,
      wallet,
    }) => {
      await forgetConsent(context)
      await openFresh(page)
      await consentBanner(page).getByRole('button', { name: button }).click()
      await expect(consentBanner(page)).toBeHidden()
      expect(await storedConsent(context)).toBe(stored)

      await page.reload()
      await waitForAnalyticsReady(page)
      await expect(connectButton(page)).toBeVisible()
      await expect(consentBanner(page)).toBeHidden()

      await connectWithHeadlessWallet(page, wallet)
      await expect(consentBanner(page)).toBeHidden()

      await wallet.changeAccounts([])
      await expect(connectButton(page)).toBeVisible({ timeout: 30_000 })
      await expect(consentBanner(page)).toBeHidden()
      expect(await storedConsent(context)).toBe(stored)

      await page.reload()
      await waitForAnalyticsReady(page)
      await expect(connectButton(page)).toBeVisible()
      await expect(consentBanner(page)).toBeHidden()
      expect(await storedConsent(context)).toBe(stored)
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
      await wallet.changeAccounts([])
      await expect(connectButton(page)).toBeVisible({ timeout: 30_000 })
    }

    // Before any choice.
    await walk()
    await expectBrowserSilent(page, standIn)
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
    await page.waitForTimeout(1_000)

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
    await expectRecordingsWhereBuilt(page, standIn, ORIGIN, acceptedAt)

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

    // Disconnecting: analytics go on and the choice is still Accept.
    const disconnectedAt = Date.now()
    await openFresh(page)
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
    await forgetConsent(context)
    await page.setViewportSize(DESKTOP)
    await openFresh(page)
    await acceptButton(page).click()
    await connectWithHeadlessWallet(page, wallet)
    await expect
      .poll(() => identifiesWallet(standIn, TEST_WALLET), {
        timeout: FLUSH_TIMEOUT,
      })
      .toBe(true)

    await openFresh(page, NOTICE_PATH)
    const notice = analyticsNotice(page)
    const toggle = analyticsSwitch(page)
    await expect(toggle).toBeChecked()
    await expect(notice).toContainText(/accepted/i)

    await toggle.click()
    const declinedAt = Date.now()
    await expect(toggle).not.toBeChecked()
    await expect(notice).toContainText(/declined/i)
    expect(await storedConsent(context)).toBe('0')
    await expectNoPostHogStorage(page)
    expect((await pageDistinctId(page))?.toLowerCase()).not.toBe(
      TEST_WALLET.toLowerCase(),
    )

    await throwPageErrors(page, {
      error: 'after-decline-error',
      rejection: 'after-decline-rejection',
    })
    await page.mouse.click(DESKTOP.width / 2, DESKTOP.height / 2)
    await openFresh(page, '/?after-decline')
    await page.waitForTimeout(QUIET_PERIOD)
    const quietFrom = Date.now()
    await expectBrowserSilent(page, standIn, quietFrom)
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

    await openFresh(page, NOTICE_PATH)
    await expect(analyticsSwitch(page)).not.toBeChecked()
    const resumedAt = Date.now()
    await analyticsSwitch(page).click()
    await expect(analyticsSwitch(page)).toBeChecked()
    await expect(analyticsNotice(page)).toContainText(/accepted/i)
    expect(await storedConsent(context)).toBe('1')
    await openFresh(page)
    await expect
      .poll(
        () =>
          browserRequestsSince(standIn, resumedAt).some((request) =>
            request.events.some((event) => event.event === '$pageview'),
          ),
        { timeout: FLUSH_TIMEOUT },
      )
      .toBe(true)
    await expectRecordingsWhereBuilt(page, standIn, ORIGIN, resumedAt)
  })

  test('C5: the notice, opened from the banner, says what is collected and why, who processes it, and how to ask for deletion', async ({
    page,
    context,
  }) => {
    await forgetConsent(context)
    await openFresh(page)
    await consentBanner(page)
      .getByRole('link', { name: 'Privacy notice' })
      .click()
    await expect(page).toHaveURL(`${ORIGIN}${NOTICE_PATH}`)

    const notice = analyticsNotice(page)
    await expect(notice).toBeVisible()
    const text = (await notice.textContent()) ?? ''
    for (const [statement, pattern] of NOTICE_STATEMENTS) {
      expect(text, statement).toMatch(pattern)
    }
    await expect(analyticsSwitch(page)).toBeVisible()
    await expect(analyticsSwitch(page)).not.toBeChecked()
    await expect(notice).toContainText(/not chosen/i)

    // The full policy stays one click away.
    await expect(
      page.getByRole('link', { name: /full privacy policy/i }),
    ).toHaveAttribute('href', FULL_POLICY)
  })
})

/** What C5 asks the notice to say, each as the words a reader would look for. */
const NOTICE_STATEMENTS: readonly (readonly [string, RegExp])[] = [
  ['wallet addresses', /wallet address/i],
  ['the IP address sent with every request', /IP address/i],
  ['the time zone', /time zone/i],
  ['browser details', /browser details/i],
  ['page visits', /pages you visit/i],
  ['names and addresses in page addresses', /page addresses/i],
  ['clicks and other interactions', /clicks and other interactions/i],
  ['performance timings', /performance timings/i],
  ['campaign and referrer details', /campaign and referrer/i],
  ['session recordings, which show what is on the page', /session recordings/i],
  ['survey answers', /survey answers/i],
  ['the usage events', /usage events/i],
  ['the failed-transaction report', /failed transaction/i],
  ['the support-chat link-up', /support chat/i],
  ["the header that carries the visitor id to ENS's backend", /backend/i],
  ['which features are on', /which features are on/i],
  ['error reports', /error reports/i],
  ['why it is collected', /\bto (understand|find|improve)\b/i],
  ['PostHog as processor', /PostHog/],
  ['PostHog as processor', /processor/i],
  ['how to ask for deletion', /privacy@ens\.domains/],
  ['how to ask for deletion', /delet/i],
  ['the choice applies across the ENS apps that share it', /ENS apps/i],
  ['the shared cookie holds the visitor id', /cookie/i],
  [
    'the visitor id is the wallet address once a wallet is connected',
    /visitor id/i,
  ],
  ['the ENS sites on the shared domain can read it', /ENS sites/i],
  ['addresses and .eth names are cut from error messages', /\.eth names/i],
  ['other names may remain', /other names may remain/i],
]
