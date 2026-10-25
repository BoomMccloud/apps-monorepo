import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Picks the wallet's USDC when the dialog offers a token.
 *
 * Matched exactly, so the L2 rows beside it ("Select USDC on Base Sepolia")
 * are not candidates. A fully covered payment hides the picker, and an only
 * token is auto-selected, so clicking is the exception rather than the rule:
 * clicking a selection the dialog has already made races the re-render it
 * triggers and the button detaches mid-click.
 */
export async function selectUsdcIfOffered(page: Page) {
  const select = page.getByRole('button', { name: 'Select USDC', exact: true })
  const covered = page.getByText(/fully covered/i)

  await expect(select.or(covered).first()).toBeVisible({ timeout: 60_000 })

  if (!(await select.isVisible())) return
  if ((await select.getAttribute('aria-pressed')) === 'true') return

  await select.click()
}
