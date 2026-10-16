import type { AnalyticsConsentState } from '@ens-apps/utils/analyticsConsentContext'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

const displaySurvey = vi.fn()

vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ displaySurvey }),
}))

vi.mock('./ThemeToggle', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}))

// FEEDBACK_SURVEY_ID is read at module scope, so the env must be stubbed
// before a fresh import of the component, and the consent context comes from
// the same fresh set of modules.
const importSettingsMenu = async (surveyId: string | undefined) => {
  vi.resetModules()
  vi.stubEnv('VITE_PUBLIC_POSTHOG_FEEDBACK_SURVEY_ID', surveyId)
  return {
    SettingsMenu: (await import('./SettingsMenu')).SettingsMenu,
    AnalyticsConsentContext: (
      await import('@ens-apps/utils/analyticsConsentContext')
    ).AnalyticsConsentContext,
  }
}

const openMenu = async (
  {
    SettingsMenu,
    AnalyticsConsentContext,
  }: Awaited<ReturnType<typeof importSettingsMenu>>,
  consent: AnalyticsConsentState,
) => {
  const user = userEvent.setup()
  render(
    <AnalyticsConsentContext
      value={{ consent, accept: vi.fn(), decline: vi.fn() }}
    >
      <SettingsMenu />
    </AnalyticsConsentContext>,
  )
  await user.click(screen.getByRole('button', { name: 'Settings' }))
  expect(await screen.findByTestId('theme-toggle')).toBeInTheDocument()
  return user
}

afterEach(() => {
  vi.unstubAllEnvs()
  displaySurvey.mockClear()
})

describe('SettingsMenu', () => {
  it('opens the feedback survey with the configured id once the visitor has accepted', async () => {
    const menu = await importSettingsMenu('survey-123')
    const user = await openMenu(menu, 'granted')

    await user.click(await screen.findByRole('menuitem', { name: /feedback/i }))

    expect(displaySurvey).toHaveBeenCalledWith('survey-123', {
      displayType: 'popover',
      ignoreConditions: true,
      ignoreDelay: true,
    })
  })

  it.each([
    'pending',
    'denied',
    'unknown',
  ] as const)('hides the feedback survey while the choice is %s', async (consent) => {
    const menu = await importSettingsMenu('survey-123')
    await openMenu(menu, consent)

    expect(screen.queryByRole('menuitem', { name: /feedback/i })).toBeNull()
    expect(displaySurvey).not.toHaveBeenCalled()
  })

  it('hides the feedback item when no survey id is configured', async () => {
    const menu = await importSettingsMenu(undefined)
    await openMenu(menu, 'granted')

    expect(screen.queryByRole('menuitem', { name: /feedback/i })).toBeNull()
  })
})
