import {
  type BrowserContext,
  expect,
  type Locator,
  type Page,
  type TestInfo,
  test,
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

export const BANNER_HEADING = 'Help us improve ENS'
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
export const QUIET_PERIOD = 8_000

export const consentBanner = (page: Page): Locator =>
  page.getByRole('region', { name: BANNER_HEADING })

export const acceptButton = (page: Page): Locator =>
  consentBanner(page).getByRole('button', { name: 'Accept Analytics' })

export const declineButton = (page: Page): Locator =>
  consentBanner(page).getByRole('button', { name: 'Decline' })

export const analyticsNotice = (page: Page): Locator =>
  page.getByRole('region', { name: 'Analytics', exact: true })

export const analyticsSwitch = (page: Page): Locator =>
  analyticsNotice(page).getByRole('switch', { name: 'Allow analytics' })

/** Forget any choice the fixtures stored, so the visitor has not chosen. */
export const forgetConsent = async (context: BrowserContext): Promise<void> => {
  await context.clearCookies({ name: CONSENT_COOKIE_NAME })
}

export const storedConsent = async (
  context: BrowserContext,
): Promise<string | undefined> =>
  (await context.cookies()).find(
    (cookie) => cookie.name === CONSENT_COOKIE_NAME,
  )?.value

/** PostHog keeps its visitor id under `ph_<key>_posthog`; its own consent key under `__ph_opt_in_out_<key>`. */
const isPostHogKey = (key: string): boolean => /^(__)?ph_/.test(key)

/** Every PostHog entry the browser holds, in cookies or either storage. */
export const postHogStorageKeys = async (page: Page): Promise<string[]> => {
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

type Box = { x: number; y: number; width: number; height: number }

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
  if (!cardBox || !viewport) return
  const gap = 64
  expect(viewport.height - (cardBox.y + cardBox.height)).toBeLessThanOrEqual(
    gap,
  )
  expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(viewport.height)
  if (corner === 'left') {
    expect(cardBox.x).toBeLessThanOrEqual(gap)
  } else {
    expect(viewport.width - (cardBox.x + cardBox.width)).toBeLessThanOrEqual(
      gap,
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

/** Throw an uncaught error and an unhandled rejection in the page. */
export const throwPageErrors = async (
  page: Page,
  messages: { readonly error: string; readonly rejection: string },
): Promise<void> => {
  await page.evaluate(({ error, rejection }) => {
    window.setTimeout(() => {
      throw new Error(error)
    }, 0)
    void Promise.reject(new Error(rejection))
  }, messages)
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

/** Wait out a full batch interval, then confirm the browser sent nothing. */
export const expectBrowserSilent = async (
  page: Page,
  standIn: PostHogStandIn,
  since = 0,
): Promise<void> => {
  await page.waitForTimeout(QUIET_PERIOD)
  const sent = standIn
    .browserRequests()
    .filter((request) => request.receivedAt >= since)
    .map((request) => `${request.method} ${request.path}`)
  expect(sent, 'requests from the browser to PostHog').toEqual([])
}

/**
 * Recordings, on a production build. A dev server keeps them off, as it did
 * before the pause (`disable_session_recording: DEV`), so there the walk
 * confirms none were sent and records recordings as not covered.
 */
export const expectRecordingsWhereBuilt = async (
  page: Page,
  standIn: PostHogStandIn,
  origin: string,
  since: number,
): Promise<void> => {
  const recordingRequests = () =>
    browserRequestsSince(standIn, since).filter(
      (request) =>
        request.path.startsWith('/s') &&
        request.events.some((event) => event.event === '$snapshot'),
    )
  if (await isDevServer(page, origin)) {
    test.info().annotations.push({
      type: 'not covered',
      description:
        'recordings: the app runs on a dev server, where recordings stay off as before the pause',
    })
    expect(recordingRequests()).toEqual([])
    return
  }
  await expect
    .poll(() => recordingRequests().length, {
      message: 'the browser sends recording data',
      timeout: FLUSH_TIMEOUT,
    })
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
    typeof entry === 'object' && entry !== null && 'value' in entry
      ? String((entry as { value: unknown }).value)
      : '',
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
  posthog?: {
    __loaded?: boolean
    get_distinct_id?: () => string
    getFeatureFlag?: (
      key: string,
      options?: { send_event?: boolean },
    ) => unknown
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
export const isDevServer = async (
  page: Page,
  origin: string,
): Promise<boolean> => {
  const response = await page.request
    .get(`${origin}/@vite/client`, { failOnStatusCode: false })
    .catch(() => null)
  return response?.status() === 200
}
