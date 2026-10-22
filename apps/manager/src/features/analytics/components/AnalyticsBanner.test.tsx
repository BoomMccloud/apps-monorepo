import '@testing-library/jest-dom'
import {
  AnalyticsConsentContext,
  type AnalyticsConsentState,
} from '@ens-apps/utils/analyticsConsentContext'
import { describeAnalyticsBanner } from '@ens-apps/utils/testing/describeAnalyticsBanner'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AnalyticsBanner } from './AnalyticsBanner'

const renderBanner = (consent: AnalyticsConsentState) => {
  const accept = vi.fn()
  const decline = vi.fn()
  render(
    <AnalyticsConsentContext value={{ consent, accept, decline }}>
      <AnalyticsBanner />
    </AnalyticsConsentContext>,
  )
  return { accept, decline }
}

const banner = () =>
  screen.queryByRole('region', { name: 'Help us improve ENS' })

describe('AnalyticsBanner', () => {
  it('sits at the bottom of the screen on a phone, and keeps its corner from 480 px', () => {
    renderBanner('pending')

    // greptile: no-arbitrary-tailwind: this is the class the component
    // justifies, written out so that the test can look for it.
    expect(banner()).toHaveClass(
      'bottom-[calc(0.625rem+env(safe-area-inset-bottom,0px))]',
      'xs:bottom-6',
      'xs:left-6',
    )
    expect(
      Array.from(banner()?.classList ?? []).filter(
        (name) => name.startsWith('top-') || name.startsWith('xs:top-'),
      ),
    ).toEqual([])
  })
})

describeAnalyticsBanner({
  Banner: AnalyticsBanner,
  kit: { render, screen, press: (element) => fireEvent.click(element) },
})
