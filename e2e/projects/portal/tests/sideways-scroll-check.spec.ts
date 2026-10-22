import { expect, test } from '@playwright/test'
import { expectNoSidewaysScroll } from '../../../helpers/analytics-consent.js'
import { PHONE } from '../../../helpers/analytics-walks.js'

/**
 * The proof of `expectNoSidewaysScroll`, which the consent specs trust: a card
 * inside the screen passes on a page that is wider than the screen, and a card
 * that makes the page wider fails. The pages are made here, so no app, font or
 * host takes part.
 */

const PAGE_WIDTH_PX = 420

// The doctype puts the page in standards mode, as the apps' pages are: without
// it the root element's scrollWidth leaves out a card that sticks out. The
// heading names the section, as it names the banner the helper looks for.
const pageWithCard = (cardStyle: string): string => `<!doctype html>
  <body style="margin: 0">
    <div style="width: ${PAGE_WIDTH_PX}px; height: 40px">A block wider than a phone</div>
    <section aria-labelledby="card-heading" style="${cardStyle}">
      <h2 id="card-heading">Help us improve ENS</h2>
    </section>
  </body>`

test.use({ viewport: PHONE })

test.describe('expectNoSidewaysScroll', () => {
  test('passes for a card inside the screen, although the page is wider than the screen', async ({
    page,
  }) => {
    await page.setContent(
      pageWithCard('position: fixed; left: 10px; right: 10px; bottom: 10px'),
    )
    const pageWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    )
    expect(pageWidth, 'the page is wider than the screen').toBeGreaterThan(
      PHONE.width,
    )

    await expectNoSidewaysScroll(page)
  })

  test('rejects a card that makes the page wider', async ({ page }) => {
    await page.setContent(
      pageWithCard('position: absolute; top: 0; left: 0; width: 600px'),
    )

    await expect(expectNoSidewaysScroll(page)).rejects.toThrow(
      'the page is wider with the card than without it',
    )
  })
})
