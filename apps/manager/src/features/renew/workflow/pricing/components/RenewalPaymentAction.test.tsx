import '@testing-library/jest-dom'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RenewalPaymentAction } from './RenewalPaymentAction'

i18n.loadAndActivate({ locale: 'en', messages: {} })
describe('renewal CTA', () => {
  it.each([
    { state: { hasWalletDebit: true }, text: 'Continue in wallet' },
    { state: { hasWalletDebit: false }, text: 'Sign renewal' },
    {
      state: { isAwaitingApproval: true, isSigning: false },
      text: 'Preparing renewal...',
    },
    {
      state: { isAwaitingApproval: true, isSigning: true },
      text: 'Sign in wallet',
    },
    { state: { isQuoting: true }, text: 'Calculating cost...' },
    { state: { isIntentRoute: false }, text: 'Renew name' },
  ])('describes the next action: $text', ({ state, text }) => {
    render(
      <I18nProvider i18n={i18n}>
        <RenewalPaymentAction
          hasWalletDebit
          isAwaitingApproval={false}
          isIntentRoute
          isQuoting={false}
          isSigning={false}
          {...state}
        />
      </I18nProvider>,
    )
    expect(screen.getByText(text)).toBeVisible()
  })
})
