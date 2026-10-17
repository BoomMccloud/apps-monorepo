import '@testing-library/jest-dom'
import {
  AnalyticsConsentContext,
  type AnalyticsConsentState,
} from '@ens-apps/utils/analyticsConsentContext'
import { NOTICE_STATEMENTS } from '@ens-apps/utils/analyticsNoticeStatements'
import { fireEvent, render, screen } from '@testing-library/react'
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

    for (const [statement, pattern] of NOTICE_STATEMENTS) {
      expect(text, statement).toMatch(pattern)
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

  it('accepts when switched on', () => {
    const off = renderNotice('denied')
    fireEvent.click(analyticsSwitch())
    expect(off.accept).toHaveBeenCalledOnce()
    expect(off.decline).not.toHaveBeenCalled()
  })

  it('declines when an accepted choice is switched off', () => {
    const on = renderNotice('granted')
    fireEvent.click(analyticsSwitch())
    expect(on.decline).toHaveBeenCalledOnce()
    expect(on.accept).not.toHaveBeenCalled()
  })

  it('cannot be switched before analytics have started', () => {
    renderNotice('unknown')
    expect(analyticsSwitch()).toBeDisabled()
    expect(notice()).not.toHaveTextContent(/your choice:/i)
  })
})
