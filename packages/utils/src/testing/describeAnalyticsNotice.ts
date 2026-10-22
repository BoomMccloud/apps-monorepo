import type { ComponentType } from 'react'
import { describe, expect, it } from 'vitest'
import { NOT_CAPTURED_CLASS } from '../analyticsConsent'
import type { AnalyticsConsentState } from '../analyticsConsentContext'
import { NOTICE_STATEMENTS } from './analyticsNoticeStatements'
import { type DomTestKit, renderWithChoice } from './domTestKit'

/**
 * What the analytics notice does in every ENS app: it says what is collected
 * and why, who processes it and how to ask for deletion, and its switch shows
 * the visitor's choice and changes it. `Notice` is the component that holds
 * the notice: the notice itself, or the page that has it.
 */
export const describeAnalyticsNotice = ({
  Notice,
  kit: { render, screen, press },
}: {
  readonly Notice: ComponentType
  readonly kit: DomTestKit
}): void => {
  const renderNotice = (consent: AnalyticsConsentState) =>
    renderWithChoice(render, Notice, consent)

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
        screen
          .getByRole('link', { name: 'privacy@ens.domains' })
          .getAttribute('href'),
      ).toBe('mailto:privacy@ens.domains')
    })

    it.each([
      ['granted', true, /your choice: accepted/i],
      ['denied', false, /your choice: declined/i],
      ['pending', false, /your choice: not chosen yet/i],
    ] as const)('shows a %s choice on the switch and in words', (consent, isOn, words) => {
      renderNotice(consent)

      expect(analyticsSwitch().getAttribute('aria-checked')).toBe(String(isOn))
      expect(notice().textContent).toMatch(words)
    })

    it('accepts when switched on', async () => {
      const off = renderNotice('denied')

      await press(analyticsSwitch())

      expect(off.accept).toHaveBeenCalledOnce()
      expect(off.decline).not.toHaveBeenCalled()
    })

    it('declines when an accepted choice is switched off', async () => {
      const on = renderNotice('granted')

      await press(analyticsSwitch())

      expect(on.decline).toHaveBeenCalledOnce()
      expect(on.accept).not.toHaveBeenCalled()
    })

    it('keeps the switch out of what PostHog captures, so the press that declines is not sent as a click', () => {
      renderNotice('granted')

      expect(analyticsSwitch().closest(`.${NOT_CAPTURED_CLASS}`)).not.toBeNull()
    })

    it('cannot be switched before analytics have started', () => {
      renderNotice('unknown')

      expect(analyticsSwitch().hasAttribute('disabled')).toBe(true)
      expect(notice().textContent).not.toMatch(/your choice:/i)
    })
  })
}
