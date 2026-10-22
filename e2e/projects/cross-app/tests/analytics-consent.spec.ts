import { POSTHOG_PROJECT_SETTINGS } from '@ens-apps/utils/testing/postHogAnswers'
import { expect, type Page, test } from '@playwright/test'
import {
  acceptButton,
  analyticsNotice,
  analyticsSwitch,
  consentBanner,
  consentCookie,
  declineButton,
  waitForAnalyticsReady,
} from '../../../helpers/analytics-consent.js'
import {
  type PostHogStandIn,
  STAND_IN_FLAG_RULES,
  startPostHogStandIn,
} from '../../../helpers/posthog-stand-in.js'
import { baseConfig } from '../../../playwright.config.base.js'

/**
 * The one choice both apps share (WEB-1741, D5), walked on two hostnames
 * under one parent, as production serves the apps. `MANAGER_APP_URL` and
 * `PORTAL_APP_URL` may name the shared hostnames themselves
 * (`http://manager.ens.test:3400`); a loopback address is moved onto them,
 * keeping its port. The browser maps every `*.ens.test` host to loopback.
 * The Explorer on `localhost` is the unrelated hostname.
 */

const SHARED_PARENT = 'ens.test'

const onSharedParent = (url: string, label: string): string => {
  const parsed = new URL(url)
  if (!parsed.hostname.endsWith(`.${SHARED_PARENT}`)) {
    parsed.hostname = `${label}.${SHARED_PARENT}`
  }
  return parsed.origin
}

const MANAGER = onSharedParent(
  process.env.MANAGER_APP_URL ?? 'http://localhost:3000',
  'manager',
)
const EXPLORER = onSharedParent(
  process.env.PORTAL_APP_URL ?? 'http://localhost:3001',
  'explorer',
)
const UNRELATED = (() => {
  const parsed = new URL(EXPLORER)
  parsed.hostname = 'localhost'
  return parsed.origin
})()

const MANAGER_NOTICE = '/privacy'
const EXPLORER_NOTICE = '/privacy'

const baseLaunchOptions = baseConfig.use?.launchOptions ?? {}

test.use({
  launchOptions: {
    ...baseLaunchOptions,
    args: [
      ...(baseLaunchOptions.args ?? []),
      `--host-resolver-rules=MAP *.${SHARED_PARENT} localhost`,
    ],
  },
})

let standIn: PostHogStandIn

test.beforeAll(async () => {
  standIn = await startPostHogStandIn({
    rules: STAND_IN_FLAG_RULES,
    remoteConfig: POSTHOG_PROJECT_SETTINGS,
  })
})

test.afterAll(async () => {
  await standIn?.close()
})

const open = async (page: Page, url: string): Promise<void> => {
  await page.goto(url)
  await waitForAnalyticsReady(page)
}

/** Load a page afresh: a tab already on that page is loaded again. */
const load = async (page: Page, url: string): Promise<void> => {
  const isOnPage = page.url().split('#')[0] === url.split('#')[0]
  await page.goto(url)
  if (isOnPage) await page.reload()
  await waitForAnalyticsReady(page)
}

/** The choice the app's notice reports once loaded: its switch, and its words. */
const expectNoticeReports = async (
  page: Page,
  url: string,
  choice: 'accepted' | 'declined',
): Promise<void> => {
  await load(page, url)
  await expect(analyticsNotice(page)).toContainText(new RegExp(choice, 'i'))
  if (choice === 'accepted') {
    await expect(analyticsSwitch(page)).toBeChecked()
  } else {
    await expect(analyticsSwitch(page)).not.toBeChecked()
  }
}

test.describe('One analytics choice for both apps', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies()
  })

  test('C1: Accept in the Manager applies in the Explorer, and the unrelated hostname still asks', async ({
    page,
    context,
  }) => {
    await open(page, MANAGER)
    await expect(consentBanner(page)).toBeVisible()
    await acceptButton(page).click()
    await expect(consentBanner(page)).toBeHidden()
    expect((await consentCookie(context))?.domain).toBe(`.${SHARED_PARENT}`)

    const explorer = await context.newPage()
    await open(explorer, EXPLORER)
    await expect(consentBanner(explorer)).toBeHidden()
    await expectNoticeReports(
      explorer,
      `${EXPLORER}${EXPLORER_NOTICE}`,
      'accepted',
    )

    const unrelated = await context.newPage()
    await open(unrelated, UNRELATED)
    await expect(consentBanner(unrelated)).toBeVisible()
  })

  test('C1: Decline in the Explorer applies in the Manager, and the unrelated hostname still asks', async ({
    page,
    context,
  }) => {
    await open(page, EXPLORER)
    await expect(consentBanner(page)).toBeVisible()
    await declineButton(page).click()
    await expect(consentBanner(page)).toBeHidden()
    expect((await consentCookie(context))?.domain).toBe(`.${SHARED_PARENT}`)

    const manager = await context.newPage()
    await open(manager, MANAGER)
    await expect(consentBanner(manager)).toBeHidden()
    await expectNoticeReports(
      manager,
      `${MANAGER}${MANAGER_NOTICE}`,
      'declined',
    )

    const unrelated = await context.newPage()
    await open(unrelated, UNRELATED)
    await expect(consentBanner(unrelated)).toBeVisible()
  })

  test('C4: a change on either notice applies to the other app once it reloads', async ({
    page,
    context,
  }) => {
    await open(page, MANAGER)
    await acceptButton(page).click()
    const explorer = await context.newPage()
    await expectNoticeReports(
      explorer,
      `${EXPLORER}${EXPLORER_NOTICE}`,
      'accepted',
    )

    // Decline on the Manager's notice; the Explorer, reloaded, says so.
    await open(page, `${MANAGER}${MANAGER_NOTICE}`)
    await analyticsSwitch(page).click()
    await expect(analyticsSwitch(page)).not.toBeChecked()
    await expectNoticeReports(
      explorer,
      `${EXPLORER}${EXPLORER_NOTICE}`,
      'declined',
    )
    await expect(consentBanner(explorer)).toBeHidden()

    // Accept again on the Explorer's notice; the Manager, reloaded, says so.
    await analyticsSwitch(explorer).click()
    await expect(analyticsSwitch(explorer)).toBeChecked()
    await expectNoticeReports(page, `${MANAGER}${MANAGER_NOTICE}`, 'accepted')
    await expect(consentBanner(page)).toBeHidden()
  })
})
