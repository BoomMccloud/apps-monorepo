import { isRecord } from '@ens-apps/utils/isRecord'
import {
  type BrowserContext,
  type Cookie,
  expect,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test'
import type {
  CapturedEvent,
  PostHogStandIn,
  RecordedRequest,
} from './posthog-stand-in.js'

/**
 * The visitor's analytics choice, as both apps share it. PostHog's own
 * consent setting writes it: `1` after Accept, `0` after Decline, and no
 * cookie while the visitor has not chosen.
 */
export const CONSENT_COOKIE_NAME = 'ens.analytics.consent'

const BANNER_HEADING = 'Help us improve ENS'
const FRIENDLY_SENTENCE =
  /Optional analytics help ENS understand how the apps are used, find problems and improve the experience/
// The statement of what is collected names, at least, these.
const COLLECTED = [
  /wallet address/i,
  /pages you visit/i,
  /error reports/i,
  /IP address/i,
] as const

/** Events leave the browser in batches a few seconds after they happen. */
export const FLUSH_TIMEOUT = 30_000
/** How long a check of "nothing was sent" waits for a batch that never comes. */
const QUIET_PERIOD = 8_000
/** How far from the screen's edges a card in a bottom corner may sit. */
const CORNER_GAP_PX = 64

export const consentBanner = (page: Page): Locator =>
  page.getByRole('region', { name: BANNER_HEADING })

export const acceptButton = (page: Page): Locator =>
  consentBanner(page).getByRole('button', { name: 'Accept Analytics' })

export const declineButton = (page: Page): Locator =>
  consentBanner(page).getByRole('button', { name: 'Decline' })

/** The banner's link to the privacy notice. */
export const noticeLink = (page: Page): Locator =>
  consentBanner(page).getByRole('link', { name: 'Privacy notice' })

export const analyticsNotice = (page: Page): Locator =>
  page.getByRole('region', { name: 'Analytics', exact: true })

export const analyticsSwitch = (page: Page): Locator =>
  analyticsNotice(page).getByRole('switch', { name: 'Allow analytics' })

/**
 * Show the walk's browser to PostHog as a visitor's. The SDK drops every
 * event from a browser it takes for a bot, and an automated Chromium says it
 * is one (`navigator.webdriver`, a HeadlessChrome user agent), so without
 * this no event could follow Accept, and the silence before it would prove
 * nothing about events. It runs before any page script.
 */
export const presentAsVisitorBrowser = (
  context: BrowserContext,
): Promise<void> =>
  context.addInitScript(() => {
    const userAgent = navigator.userAgent.replace(/HeadlessChrome/g, 'Chrome')
    Object.defineProperties(Navigator.prototype, {
      webdriver: { configurable: true, get: () => false },
      userAgent: { configurable: true, get: () => userAgent },
      userAgentData: { configurable: true, get: () => undefined },
    })
  })

/** Forget any choice the fixtures stored, so the visitor has not chosen. */
export const forgetConsent = async (context: BrowserContext): Promise<void> => {
  await context.clearCookies({ name: CONSENT_COOKIE_NAME })
}

export const consentCookie = async (
  context: BrowserContext,
): Promise<Cookie | undefined> =>
  (await context.cookies()).find(
    (cookie) => cookie.name === CONSENT_COOKIE_NAME,
  )

export const storedConsent = async (
  context: BrowserContext,
): Promise<string | undefined> => (await consentCookie(context))?.value

/** PostHog keeps its visitor id under `ph_<key>_posthog`; its own consent key under `__ph_opt_in_out_<key>`. */
const isPostHogKey = (key: string): boolean => /^(__)?ph_/.test(key)

/** Every PostHog entry the browser holds, in cookies or either storage. */
const postHogStorageKeys = async (page: Page): Promise<string[]> => {
  const cookieNames = (await page.context().cookies()).map(
    (cookie) => cookie.name,
  )
  const storageKeys = await page.evaluate(() => [
    ...Object.keys(window.localStorage),
    ...Object.keys(window.sessionStorage),
  ])
  return [...cookieNames, ...storageKeys].filter(isPostHogKey)
}

export const expectNoPostHogStorage = async (page: Page): Promise<void> => {
  expect(await postHogStorageKeys(page)).toEqual([])
}

/** The banner's words come in the order the ticket gives them. */
export const expectBannerWording = async (banner: Locator): Promise<void> => {
  await expect(
    banner.getByRole('heading', { name: BANNER_HEADING }),
  ).toBeVisible()
  const text = (await banner.textContent()) ?? ''
  const headingAt = text.indexOf(BANNER_HEADING)
  const sentenceAt = text.search(FRIENDLY_SENTENCE)
  const collectedAt = Math.max(...COLLECTED.map((part) => text.search(part)))
  const buttonsAt = text.indexOf('Accept Analytics')
  expect(headingAt, 'the heading').toBeGreaterThanOrEqual(0)
  expect(sentenceAt, 'the friendly sentence').toBeGreaterThan(headingAt)
  for (const part of COLLECTED) {
    expect(text, `what is collected: ${part}`).toMatch(part)
  }
  expect(
    Math.min(...COLLECTED.map((part) => text.search(part))),
  ).toBeGreaterThan(sentenceAt)
  expect(buttonsAt, 'the buttons come last').toBeGreaterThan(collectedAt)
  await expect(
    banner.getByRole('link', { name: 'Privacy notice' }),
  ).toBeVisible()
}

const STYLE_PROPERTIES = [
  'background-color',
  'color',
  'border-top-width',
  'border-top-style',
  'border-top-color',
  'border-radius',
  'font-family',
  'font-size',
  'font-weight',
  'padding-top',
  'padding-left',
] as const

const computedStyle = (locator: Locator): Promise<Record<string, string>> =>
  locator.evaluate(
    (element, properties) => {
      const style = window.getComputedStyle(element)
      return Object.fromEntries(
        properties.map((name) => [name, style.getPropertyValue(name)]),
      )
    },
    [...STYLE_PROPERTIES],
  )

/** Accept Analytics and Decline are the same size and the same style. */
export const expectEqualButtons = async (page: Page): Promise<void> => {
  const accept = acceptButton(page)
  const decline = declineButton(page)
  await expect(accept).toBeVisible()
  await expect(decline).toBeVisible()
  const [acceptBox, declineBox] = await Promise.all([
    accept.boundingBox(),
    decline.boundingBox(),
  ])
  expect(acceptBox).not.toBeNull()
  expect(declineBox).not.toBeNull()
  expect(
    Math.abs((acceptBox?.width ?? 0) - (declineBox?.width ?? -1)),
  ).toBeLessThanOrEqual(1)
  expect(
    Math.abs((acceptBox?.height ?? 0) - (declineBox?.height ?? -1)),
  ).toBeLessThanOrEqual(1)
  expect(await computedStyle(accept)).toEqual(await computedStyle(decline))
}

type Box = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

const intersects = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height

const visibleBoxes = async (locator: Locator): Promise<Box[]> => {
  const boxes: Box[] = []
  for (const element of await locator.all()) {
    if (!(await element.isVisible())) continue
    const box = await element.boundingBox()
    if (box && box.width > 0 && box.height > 0) boxes.push(box)
  }
  return boxes
}

/** The card covers none of these controls. */
export const expectCardClearOf = async (
  card: Locator,
  controls: Locator,
  what: string,
): Promise<void> => {
  const cardBox = await card.boundingBox()
  expect(cardBox).not.toBeNull()
  const boxes = await visibleBoxes(controls)
  expect(boxes.length, `${what}: some controls are visible`).toBeGreaterThan(0)
  for (const box of boxes) {
    expect(
      intersects(cardBox as Box, box),
      `${what}: the card overlaps a control at ${JSON.stringify(box)}`,
    ).toBe(false)
  }
}

export const expectNoSidewaysScroll = async (page: Page): Promise<void> => {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth)
}

/** On a phone the card sits at the top, under the header and inside the screen. */
export const expectCardUnderHeader = async (
  page: Page,
  card: Locator,
  header: Locator,
): Promise<void> => {
  const viewport = page.viewportSize()
  const [cardBox, headerBox] = await Promise.all([
    card.boundingBox(),
    header.boundingBox(),
  ])
  expect(cardBox).not.toBeNull()
  expect(headerBox).not.toBeNull()
  expect(viewport).not.toBeNull()
  if (!cardBox || !headerBox || !viewport) return
  expect(cardBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height - 1)
  expect(cardBox.y).toBeLessThan(viewport.height / 2)
  expect(cardBox.x).toBeGreaterThanOrEqual(0)
  expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(viewport.width)
}

/** On a desktop the card sits in the named bottom corner. */
export const expectCardInBottomCorner = async (
  page: Page,
  card: Locator,
  corner: 'left' | 'right',
): Promise<void> => {
  const viewport = page.viewportSize()
  const cardBox = await card.boundingBox()
  expect(cardBox).not.toBeNull()
  expect(viewport).not.toBeNull()
  if (!cardBox || !viewport) return
  expect(viewport.height - (cardBox.y + cardBox.height)).toBeLessThanOrEqual(
    CORNER_GAP_PX,
  )
  expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(viewport.height)
  if (corner === 'left') {
    expect(cardBox.x).toBeLessThanOrEqual(CORNER_GAP_PX)
  } else {
    expect(viewport.width - (cardBox.x + cardBox.width)).toBeLessThanOrEqual(
      CORNER_GAP_PX,
    )
  }
  expect(cardBox.width).toBeLessThan(viewport.width / 2)
}

/** A screenshot kept with the test's results, for a person to judge. */
export const keepScreenshot = async (
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> => {
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`) })
}

/**
 * Throw an uncaught error and an unhandled rejection in the page, and return
 * once the page has seen both, after the SDK's own handlers have run.
 */
export const throwPageErrors = async (
  page: Page,
  messages: { readonly error: string; readonly rejection: string },
): Promise<void> => {
  await page.evaluate(
    ({ error, rejection }) =>
      new Promise<void>((resolve) => {
        let unseen = 2
        const seen = () => {
          unseen -= 1
          if (unseen === 0) resolve()
        }
        window.addEventListener('error', seen, { once: true })
        window.addEventListener('unhandledrejection', seen, { once: true })
        window.setTimeout(() => {
          throw new Error(error)
        }, 0)
        void Promise.reject(new Error(rejection))
      }),
    messages,
  )
}

export const eventsNamed = (
  standIn: PostHogStandIn,
  name: string,
): readonly CapturedEvent[] =>
  standIn.browserEvents().filter((event) => event.event === name)

/** Wait for the browser to send at least one event of each name. */
export const expectEventsSent = async (
  standIn: PostHogStandIn,
  names: readonly string[],
): Promise<void> => {
  for (const name of names) {
    await expect
      .poll(() => eventsNamed(standIn, name).length, {
        message: `the browser sends ${name}`,
        timeout: FLUSH_TIMEOUT,
      })
      .toBeGreaterThan(0)
  }
}

/** The browser has sent PostHog nothing at or after a moment. */
export const expectNothingSent = (standIn: PostHogStandIn, since = 0): void => {
  const sent = standIn
    .browserRequests()
    .filter((request) => request.receivedAt >= since)
    .map((request) =>
      [
        `${request.method} ${request.path}`,
        ...request.events.map((event) => event.event),
      ].join(' '),
    )
  expect(sent, 'requests from the browser to PostHog').toEqual([])
}

/**
 * Wait out the longest wait the SDK has before it sends, then confirm the
 * browser sent nothing.
 */
export const expectBrowserSilent = async (
  page: Page,
  standIn: PostHogStandIn,
  since = 0,
): Promise<void> => {
  await page.waitForTimeout(QUIET_PERIOD)
  expectNothingSent(standIn, since)
}

/**
 * Recordings reach the host once the visitor has accepted. A production build
 * records by itself. A dev server keeps them off, as before the pause
 * (`disable_session_recording: DEV`), so there the walk switches the recorder
 * on through the SDK handle the page exposes, as the build's own setting would
 * have; what CI covers on a dev server is the recorder's start from the
 * project's settings and its stopping and starting again with the choice. The
 * build's setting has a unit test of its own (`collectionOn`).
 */
export const expectRecordingsSent = async (
  page: Page,
  standIn: PostHogStandIn,
  origin: string,
  since: number,
): Promise<void> => {
  if (await isDevServer(page, origin)) {
    await page.evaluate(() =>
      (window as PostHogWindow).posthog?.startSessionRecording?.(),
    )
  }
  // The recorder sends once it has seen the visitor active.
  await page.mouse.move(8, 8)
  await page.mouse.move(80, 80)
  await expect
    .poll(
      () =>
        browserRequestsSince(standIn, since).filter(
          (request) =>
            request.path.startsWith('/s') &&
            request.events.some((event) => event.event === '$snapshot'),
        ).length,
      {
        message: 'the browser sends recording data',
        timeout: FLUSH_TIMEOUT,
      },
    )
    .toBeGreaterThan(0)
}

/** The text of every request, for searching what left the browser. */
export const requestText = (request: RecordedRequest): string =>
  [
    request.path,
    request.query.toString(),
    request.headers.cookie ?? '',
    request.body,
  ].join('\n')

const exceptionMessages = (event: CapturedEvent): string[] => {
  const list = event.properties.$exception_list
  if (!Array.isArray(list)) return []
  return list.map((entry) =>
    isRecord(entry) && 'value' in entry ? String(entry.value) : '',
  )
}

/** The `$exception` events whose message came from the given marker. */
export const exceptionEventsWith = (
  standIn: PostHogStandIn,
  marker: string,
): readonly CapturedEvent[] =>
  eventsNamed(standIn, '$exception').filter((event) =>
    exceptionMessages(event).some((message) => message.includes(marker)),
  )

export const exceptionMessagesOf = (
  events: readonly CapturedEvent[],
): string[] => events.flatMap(exceptionMessages)

/** The SDK instance each app exposes on `window` for the browser tests. */
type PostHogWindow = Window & {
  readonly posthog?: {
    readonly __loaded?: boolean
    readonly get_distinct_id?: () => string
    readonly capture?: (
      name: string,
      properties?: Readonly<Record<string, unknown>>,
    ) => unknown
    readonly getFeatureFlag?: (
      key: string,
      options?: { readonly send_event?: boolean },
    ) => unknown
    readonly startSessionRecording?: () => unknown
  }
}

/** Wait until the app has started the SDK, so the banner's state is settled. */
export const waitForAnalyticsReady = async (page: Page): Promise<void> => {
  await page.waitForFunction(
    () => (window as PostHogWindow).posthog?.__loaded === true,
    undefined,
    { timeout: 30_000 },
  )
}

/** Whether the page has the named switch on, read without recording the read. */
export const pageSwitch = (page: Page, key: string): Promise<boolean> =>
  page.evaluate(
    (flag) =>
      (window as PostHogWindow).posthog?.getFeatureFlag?.(flag, {
        send_event: false,
      }) === true,
    key,
  )

/**
 * Has the Manager's Worker run its scheduled job, which fetches the switch
 * rules from the PostHog host and stores them in KV. A request only reads
 * what the job stored, and a dev server runs no cron, so a spec that reads a
 * switch runs the job first, through the route the Cloudflare plugin serves
 * for it, once the host it fetches from is up.
 */
export const refreshManagerSwitchRules = async (
  managerUrl: string,
): Promise<void> => {
  const response = await fetch(
    `${new URL(managerUrl).origin}/cdn-cgi/handler/scheduled`,
  )
  expect(
    response.status,
    "the Manager's scheduled refresh of the switch rules",
  ).toBe(200)
}

export const pageDistinctId = (page: Page): Promise<string | undefined> =>
  page.evaluate(() => (window as PostHogWindow).posthog?.get_distinct_id?.())

/** Some `$identify` tied the given wallet address to the visitor. */
export const identifiesWallet = (
  standIn: PostHogStandIn,
  address: string,
): boolean =>
  eventsNamed(standIn, '$identify').some(
    (event) =>
      String(event.properties.distinct_id).toLowerCase() ===
      address.toLowerCase(),
  )

/** Requests the browser sent at or after a moment. */
export const browserRequestsSince = (
  standIn: PostHogStandIn,
  since: number,
): readonly RecordedRequest[] =>
  standIn.browserRequests().filter((request) => request.receivedAt >= since)

/**
 * A Vite dev server always serves its client; a production build never does.
 * Recordings are off on a dev server, as they were before the pause.
 */
const isDevServer = async (page: Page, origin: string): Promise<boolean> => {
  const response = await page.request
    .get(`${origin}/@vite/client`, { failOnStatusCode: false })
    .catch(() => null)
  return response?.status() === 200
}

/** Capture an event from the page, as the app's own code would. */
const captureOnPage = (page: Page, name: string): Promise<unknown> =>
  page.evaluate(
    (eventName) =>
      (window as PostHogWindow).posthog?.capture?.(eventName, { walk: true }),
    name,
  )

const requestsCarrying = (
  standIn: PostHogStandIn,
  marker: string,
  since = 0,
): readonly RecordedRequest[] =>
  browserRequestsSince(standIn, since).filter((request) =>
    requestText(request).includes(marker),
  )

const pageLeavesSince = (
  standIn: PostHogStandIn,
  since: number,
): readonly CapturedEvent[] =>
  browserRequestsSince(standIn, since)
    .flatMap((request) => request.events)
    .filter((event) => event.event === '$pageleave')

/**
 * Nothing leaves for PostHog after a Decline, by any way the SDK has of
 * sending, and Accept sends again. One visitor, several tabs of one app: a
 * tab accepts, one holds a request in flight, one holds a failed request
 * waiting to be tried again, one will close, and one declines on the notice.
 * After the press the request in flight fails, the retry's time comes and the
 * page that closes sends its page-leave as a beacon; none of them may put a
 * request on the wire, and what was held back stays gone when the visitor
 * accepts again. The SDK sends each event as it is captured, so there is no
 * batch in another tab to flush.
 */
export const expectNoSendAfterDecline = async ({
  context,
  standIn,
  open,
  noticePath,
}: {
  readonly context: BrowserContext
  readonly standIn: PostHogStandIn
  /** Open the app at a path in a tab, and wait for its SDK. */
  readonly open: (page: Page, path: string) => Promise<void>
  readonly noticePath: string
}): Promise<void> => {
  await forgetConsent(context)
  const accepting = await context.newPage()
  await open(accepting, '/')
  await acceptButton(accepting).click()
  await expectEventsSent(standIn, ['$pageview'])

  // The control for the page that closes below: while the choice is Accept,
  // a page that closes puts its page-leave on the wire as a beacon.
  const leaving = await context.newPage()
  await open(leaving, '/')
  const leftAt = Date.now()
  await leaving.close({ runBeforeUnload: true })
  await expect
    .poll(() => pageLeavesSince(standIn, leftAt).length, {
      message: 'a page that closes sends its page-leave',
      timeout: FLUSH_TIMEOUT,
    })
    .toBeGreaterThan(0)

  // The other tabs read the accepted choice from the shared cookie.
  const inFlight = await context.newPage()
  const retrying = await context.newPage()
  const closing = await context.newPage()
  const declining = await context.newPage()
  await open(inFlight, '/')
  await open(retrying, '/')
  await open(closing, '/')
  await open(declining, noticePath)
  await expect(analyticsSwitch(declining)).toBeChecked()

  // A request that failed, and fails each time it is tried again.
  standIn.failEventRequests('walk-retry')
  await captureOnPage(retrying, 'walk-retry')
  await expect
    .poll(() => requestsCarrying(standIn, 'walk-retry').length, {
      timeout: FLUSH_TIMEOUT,
    })
    .toBeGreaterThan(0)
  // A request on its way, which PostHog has not answered.
  const held = standIn.holdEventRequests('walk-in-flight')
  await captureOnPage(inFlight, 'walk-in-flight')
  await expect
    .poll(() => requestsCarrying(standIn, 'walk-in-flight').length, {
      timeout: FLUSH_TIMEOUT,
    })
    .toBeGreaterThan(0)

  // Decline in one tab. The tab that closes now has not yet seen the choice
  // change, and PostHog answers the request in flight with an error only now.
  await analyticsSwitch(declining).click()
  const declinedAt = Date.now()
  await expect(analyticsSwitch(declining)).not.toBeChecked()
  await closing.close({ runBeforeUnload: true })
  await declining.close({ runBeforeUnload: true })
  held.release()

  // Past the time of the next retry the SDK would make, which backs off by
  // seconds, with some jitter, after each failure.
  await expectBrowserSilent(accepting, standIn, declinedAt)

  // Accept again: sending resumes, and nothing held back comes with it.
  await open(accepting, noticePath)
  await analyticsSwitch(accepting).click()
  await expect(analyticsSwitch(accepting)).toBeChecked()
  const resumedAt = Date.now()
  await captureOnPage(accepting, 'walk-after-accept')
  await expect
    .poll(
      () => requestsCarrying(standIn, 'walk-after-accept', resumedAt).length,
      {
        timeout: FLUSH_TIMEOUT,
      },
    )
    .toBeGreaterThan(0)
  expect(
    requestsCarrying(standIn, 'walk-retry', declinedAt),
    'the failed request, sent after the visitor accepted again',
  ).toEqual([])
  expect(
    requestsCarrying(standIn, 'walk-in-flight', declinedAt),
    'the request in flight, sent after the visitor accepted again',
  ).toEqual([])
}
