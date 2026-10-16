import {
  AnalyticsConsentContext,
  type AnalyticsConsentState,
} from '@ens-apps/utils/analytics-consent-context'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AnalyticsNotice } from './AnalyticsNotice'

const renderNotice = (consent: AnalyticsConsentState) => {
  const accept = vi.fn()
  const decline = vi.fn()
  render(
    <AnalyticsConsentContext value={{ consent, accept, decline }}>
      <AnalyticsNotice />
    </AnalyticsConsentContext>,
  )
  return { accept, decline }
}

const notice = () => screen.getByRole('region', { name: 'Analytics' })
const analyticsSwitch = () =>
  screen.getByRole('switch', { name: 'Allow analytics' })

describe('AnalyticsNotice', () => {
  it('says what is collected and why, who processes it, and how to ask for deletion', () => {
    renderNotice('pending')
    const text = notice().textContent ?? ''

    for (const statement of [
      /wallet address/i,
      /pages you visit/i,
      /page addresses can contain the names and wallet addresses/i,
      /clicks and other interactions/i,
      /performance timings/i,
      /campaign and referrer details/i,
      /session recordings, which show what is on the page/i,
      /survey answers/i,
      /usage events/i,
      /failed transaction/i,
      /support chat/i,
      /backend/i,
      /which features are on/i,
      /error reports/i,
      /IP address, time zone and browser details/i,
      /to understand how the apps are used/i,
      /PostHog processes this data for ENS as its processor/i,
      /applies to all ENS apps that share it/i,
      /kept in cookies that these apps share/i,
      /your visitor id is your wallet address/i,
      /any ENS site on the same domain can read it/i,
      /wallet addresses and \.eth names are cut from error messages, but other names may remain/i,
    ]) {
      expect(text).toMatch(statement)
    }
    expect(
      screen.getByRole('link', { name: 'privacy@ens.domains' }),
    ).toHaveAttribute('href', 'mailto:privacy@ens.domains')
  })

  it.each([
    ['granted', true, /your choice: accepted/i],
    ['denied', false, /your choice: declined/i],
    ['pending', false, /your choice: not chosen yet/i],
  ] as const)('shows a %s choice on the switch and in words', (consent, isOn, words) => {
    renderNotice(consent)

    expect(analyticsSwitch()).toHaveAttribute('aria-checked', String(isOn))
    expect(notice()).toHaveTextContent(words)
  })

  it('accepts when switched on, and declines when switched off', async () => {
    const user = userEvent.setup()
    const off = renderNotice('denied')
    await user.click(analyticsSwitch())
    expect(off.accept).toHaveBeenCalledOnce()
    expect(off.decline).not.toHaveBeenCalled()
  })

  it('declines when an accepted choice is switched off', async () => {
    const user = userEvent.setup()
    const on = renderNotice('granted')
    await user.click(analyticsSwitch())
    expect(on.decline).toHaveBeenCalledOnce()
    expect(on.accept).not.toHaveBeenCalled()
  })

  it('cannot be switched before analytics have started', () => {
    renderNotice('unknown')
    expect(analyticsSwitch()).toBeDisabled()
    expect(notice()).not.toHaveTextContent(/your choice:/i)
  })
})
