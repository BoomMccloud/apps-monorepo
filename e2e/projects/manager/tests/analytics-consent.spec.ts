import type { Page } from '@playwright/test'
import { expect, test } from '../../../fixtures/playwright.manager.fixture.js'
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
  pageSwitch,
  QUIET_PERIOD,
  requestText,
  storedConsent,
  throwPageErrors,
  waitForAnalyticsReady,
} from '../../../helpers/analytics-consent.js'
import {
  connectWithHeadlessWallet,
  dismissBackendAuthModal,
} from '../../../helpers/manager-auth.js'
import {
  OTHER_WALLET,
  type PostHogStandIn,
  STAND_IN_FLAG_RULES,
  STAND_IN_REMOTE_CONFIG,
  startPostHogStandIn,
  TEST_WALLET,
} from '../../../helpers/posthog-stand-in.js'
import { findSearchInput } from '../../../helpers/search-input.js'

/**
 * The analytics choice in the Manager (WEB-1741), checked where a visitor
 * meets it: the banner, the notice, and what reaches the PostHog host. The
 * Manager runs against the stand-in host this file starts
 * (`VITE_PUBLIC_POSTHOG_HOST=http://127.0.0.1:4973`), with a dummy secret
 * key for its server's rules download.
 */

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'
const ORIGIN = new URL(MANAGER_APP_URL).origin
const DESKTOP = { width: 1280, height: 800 }
const PHONE = { width: 360, height: 780 }
const SEARCHED_NAME = 'nick.eth'
const ERROR_NAME = 'vitalik.eth'

const NOTICE_PATH = '/legal/privacy-policy#analytics'

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

/** The header's own controls: the first navigation landmark is the header's. */
const headerControls = (page: Page) =>
  page.locator('nav').first().locator('a, button, input')

const connectButton = (page: Page) =>
  page.getByRole('button', { name: /^connect( login)?$/i })

const openFresh = async (page: Page, path = '/'): Promise<void> => {
  await page.goto(`${MANAGER_APP_URL}${path}`)
  await waitForAnalyticsReady(page)
}

const connectWallet = async (
  page: Page,
  wallet: Parameters<typeof connectWithHeadlessWallet>[1],
): Promise<void> => {
  await connectWithHeadlessWallet(page, wallet)
  await dismissBackendAuthModal(page)
}

/** Search a name from the header and open its result. */
const searchName = async (page: Page, name: string): Promise<void> => {
  const input = await findSearchInput(page)
  await input.click()
  await input.fill(name)
  const result = page
    .getByRole('link', { name: new RegExp(name.replace('.', '\\.'), 'i') })
    .first()
  await expect(result).toBeVisible({ timeout: 30_000 })
  await result.click()
  await expect(page).toHaveURL(new RegExp(name.replace('.', '\\.')))
}

/** The connection cookie the Manager's server reads the wallet from. */
const connectionCookie = async (page: Page): Promise<string | undefined> =>
  (await page.context().cookies()).find(
    (cookie) => cookie.name === 'ens.wallet.address',
  )?.value

const expectServerOnlyDownloadedRules = (): void => {
  const fromServer = standIn.serverRequests()
  // The walk must have made the server use the stand-in, or the rest of this
  // check would pass on nothing.
  expect(fromServer.length, 'rules downloads by the server').toBeGreaterThan(0)
  for (const request of fromServer) {
    expect(`${request.method} ${request.path}`).toBe(
      'GET /api/feature_flag/local_evaluation',
    )
    expect(request.query.get('token')).toMatch(/^phc_/)
    expect(request.headers.authorization).toMatch(/^Bearer phs_/)
    expect(request.headers.cookie).toBeUndefined()
    const text = requestText(request).toLowerCase()
    expect(text).not.toContain(TEST_WALLET.toLowerCase())
    expect(text).not.toContain(OTHER_WALLET.toLowerCase())
  }
}

test.describe('Manager analytics choice', () => {
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
    await expectCardInBottomCorner(page, banner, 'left')
    await expectCardClearOf(banner, headerControls(page), 'header at 1280px')
    await expectNoSidewaysScroll(page)
    await keepScreenshot(page, testInfo, 'manager-banner-1280')

    await page.setViewportSize(PHONE)
    await page.reload()
    await waitForAnalyticsReady(page)
    await expect(banner).toBeVisible()
    await expectEqualButtons(page)
    await expectCardUnderHeader(page, banner, page.locator('nav').first())
    await expectCardClearOf(banner, headerControls(page), 'header at 360px')
    await expectNoSidewaysScroll(page)
    await keepScreenshot(page, testInfo, 'manager-banner-360')

    // The link opens the notice inside the Manager, and the banner stays
    // until the visitor chooses.
    await banner.getByRole('link', { name: 'Privacy notice' }).click()
    await expect(page).toHaveURL(`${ORIGIN}${NOTICE_PATH}`)
    await expect(analyticsNotice(page)).toBeVisible()
    await expect(banner).toBeVisible()
    await page.goBack()
    await waitForAnalyticsReady(page)
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

      await connectWallet(page, wallet)
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

  test('C2: before a choice and after Decline the browser sends PostHog nothing, and the server only downloads the rules', async ({
    page,
    context,
    wallet,
  }) => {
    test.setTimeout(600_000)
    await forgetConsent(context)

    const walk = async () => {
      for (const path of [
        '/',
        '/legal/privacy-policy',
        '/legal/terms-of-use',
      ]) {
        await openFresh(page, path)
      }
      await openFresh(page)
      await connectWallet(page, wallet)
      await openFresh(page, '/dashboard')
      await searchName(page, SEARCHED_NAME)
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

    expectServerOnlyDownloadedRules()
  })

  test('C2: the server decides the switches for the wallet in the connection cookie, with no request from the browser', async ({
    page,
    context,
    wallet,
    accounts,
  }) => {
    test.setTimeout(600_000)
    await forgetConsent(context)
    await page.setViewportSize(DESKTOP)
    await openFresh(page)
    await declineButton(page).click()

    // The test wallet: the stand-in's rule turns migration on for it alone.
    await connectWallet(page, wallet)
    await expect
      .poll(() => connectionCookie(page))
      .toMatch(new RegExp(TEST_WALLET, 'i'))
    await expect.poll(() => pageSwitch(page, 'migration')).toBe(true)
    expect(await pageSwitch(page, 'i18n')).toBe(true)
    expect(await pageSwitch(page, 'migration-nft')).toBe(false)
    await page.goto(`${MANAGER_APP_URL}/upgrade`)
    await page.waitForTimeout(3_000)
    await expect(page).toHaveURL(`${ORIGIN}/upgrade`)
    expect(await pageSwitch(page, 'migration')).toBe(true)

    // The language selector follows its rule, which is on for everyone.
    await openFresh(page, '/dashboard')
    await page
      .locator('nav')
      .first()
      .getByRole('button', { name: /keyboard_arrow_down$/ })
      .click()
    await expect(page.getByRole('combobox', { name: 'Language' })).toBeVisible()
    await page.keyboard.press('Escape')

    // Another wallet: the migration rule does not name it.
    await wallet.changeAccounts([accounts.getPrivateKey('user2')])
    await expect
      .poll(() => connectionCookie(page), { timeout: 30_000 })
      .toMatch(new RegExp(OTHER_WALLET, 'i'))
    await expect.poll(() => pageSwitch(page, 'migration')).toBe(false)
    expect(await pageSwitch(page, 'i18n')).toBe(true)
    await page.goto(`${MANAGER_APP_URL}/upgrade`)
    await expect(page).toHaveURL(`${ORIGIN}/dashboard`)
    expect(await pageSwitch(page, 'migration')).toBe(false)

    // No wallet: the answers for a visitor with none.
    await wallet.changeAccounts([])
    await expect
      .poll(() => connectionCookie(page), { timeout: 30_000 })
      .toBeUndefined()
    await expect.poll(() => pageSwitch(page, 'migration')).toBe(false)
    expect(await pageSwitch(page, 'i18n')).toBe(true)
    await page.goto(`${MANAGER_APP_URL}/upgrade`)
    await expect(page).not.toHaveURL(`${ORIGIN}/upgrade`)
    expect(await pageSwitch(page, 'migration')).toBe(false)

    await expectBrowserSilent(page, standIn)
    expectServerOnlyDownloadedRules()
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

    // An error before the press is never reported, then or later.
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

    // (a) A wallet connected after Accept identifies the visitor, and its
    // switches follow it without the browser asking the host.
    const connectedAt = Date.now()
    await connectWallet(page, wallet)
    await expect
      .poll(() => identifiesWallet(standIn, TEST_WALLET), {
        timeout: FLUSH_TIMEOUT,
      })
      .toBe(true)
    await expect.poll(() => pageSwitch(page, 'migration')).toBe(true)
    await expectEventsSent(standIn, ['wallet:connect'])

    // Clicks, a search, a page change and a full reload.
    await openFresh(page, '/dashboard')
    await searchName(page, SEARCHED_NAME)
    await page.reload()
    await waitForAnalyticsReady(page)
    await expectEventsSent(standIn, [
      '$autocapture',
      'name:search_selected',
      '$pageleave',
      '$web_vitals',
    ])
    expect(eventsNamed(standIn, '$pageview').length).toBeGreaterThan(1)

    // The project's settings turn surveys on, so the survey list is asked for.
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

    // Error reports, with the address and the .eth name cut out.
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

    // No CSP report reaches the host.
    expect(
      standIn
        .browserRequests()
        .filter((request) => /csp|report/i.test(request.path)),
    ).toEqual([])

    // Connecting, then disconnecting: analytics go on for the visitor who
    // accepted, the choice is still Accept, and the switches follow the
    // wallet with no request to the host.
    const disconnectedAt = Date.now()
    await wallet.changeAccounts([])
    await expect(connectButton(page)).toBeVisible({ timeout: 30_000 })
    await expect.poll(() => pageSwitch(page, 'migration')).toBe(false)
    expect(await pageSwitch(page, 'i18n')).toBe(true)
    expect(await storedConsent(context)).toBe('1')
    await expectEventsSent(standIn, ['wallet:disconnect'])
    await openFresh(page, '/legal/terms-of-use')
    await expect
      .poll(
        () =>
          browserRequestsSince(standIn, disconnectedAt).some((request) =>
            request.events.some((event) => event.event === '$pageview'),
          ),
        { timeout: FLUSH_TIMEOUT },
      )
      .toBe(true)
    expect(
      browserRequestsSince(standIn, connectedAt).filter((request) =>
        request.path.startsWith('/flags'),
      ),
    ).toEqual([])
  })

  test('C3: Accept with a wallet already connected identifies the visitor at once', async ({
    page,
    context,
    wallet,
  }) => {
    test.setTimeout(300_000)
    await forgetConsent(context)
    await openFresh(page)
    await connectWallet(page, wallet)
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
    await connectWallet(page, wallet)
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

    // Decline.
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

    // Nothing that happens after the press is sent: no page view, no click,
    // no error report. A batch queued before it may still leave in the
    // next flush, so the silence is measured after one batch interval.
    await throwPageErrors(page, {
      error: 'after-decline-error',
      rejection: 'after-decline-rejection',
    })
    await page.mouse.click(DESKTOP.width / 2, DESKTOP.height / 2)
    await openFresh(page, '/legal/terms-of-use?after-decline')
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

    // Switch back: events and recordings resume.
    await openFresh(page, NOTICE_PATH)
    await expect(analyticsSwitch(page)).not.toBeChecked()
    const resumedAt = Date.now()
    await analyticsSwitch(page).click()
    await expect(analyticsSwitch(page)).toBeChecked()
    await expect(analyticsNotice(page)).toContainText(/accepted/i)
    expect(await storedConsent(context)).toBe('1')
    await openFresh(page, '/legal/terms-of-use')
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
    // It shows the current choice, with the switch.
    await expect(analyticsSwitch(page)).toBeVisible()
    await expect(analyticsSwitch(page)).not.toBeChecked()
    await expect(notice).toContainText(/not chosen/i)
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
