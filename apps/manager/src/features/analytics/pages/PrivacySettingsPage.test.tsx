import '@testing-library/jest-dom'
import {
  AnalyticsConsentContext,
  type AnalyticsConsentState,
} from '@ens-apps/utils/analyticsConsentContext'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PrivacySettingsPage } from './PrivacySettingsPage'

const renderPage = (consent: AnalyticsConsentState) => {
  const accept = vi.fn()
  const decline = vi.fn()
  render(
    <AnalyticsConsentContext value={{ consent, accept, decline }}>
      <PrivacySettingsPage />
    </AnalyticsConsentContext>,
  )
  return { accept, decline }
}

const analyticsSwitch = () =>
  screen.getByRole('switch', { name: 'Allow analytics' })

describe('PrivacySettingsPage', () => {
  it('is the Privacy settings page and holds the analytics notice', () => {
    renderPage('pending')

    expect(
      screen.getByRole('heading', { level: 1, name: 'Privacy settings' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'Analytics' }),
    ).toBeInTheDocument()
  })

  it.each([
    ['granted', true, /your choice: accepted/i],
    ['denied', false, /your choice: declined/i],
    ['pending', false, /your choice: not chosen yet/i],
  ] as const)('shows a %s choice on the switch and in words', (consent, isOn, words) => {
    renderPage(consent)

    expect(analyticsSwitch()).toHaveAttribute('aria-checked', String(isOn))
    expect(screen.getByRole('region', { name: 'Analytics' })).toHaveTextContent(
      words,
    )
  })

  it('changes the choice with the switch', () => {
    const off = renderPage('denied')
    fireEvent.click(analyticsSwitch())
    expect(off.accept).toHaveBeenCalledOnce()
    expect(off.decline).not.toHaveBeenCalled()
  })

  it('keeps the full policy one click away, in a new tab', () => {
    renderPage('pending')

    const policy = screen.getByRole('link', {
      name: 'Read the full privacy policy',
    })
    expect(policy).toHaveAttribute(
      'href',
      'https://ens.domains/legal/privacy-policy',
    )
    expect(policy).toHaveAttribute('target', '_blank')
    expect(policy).toHaveAttribute('rel', 'noopener noreferrer')
  })
})
