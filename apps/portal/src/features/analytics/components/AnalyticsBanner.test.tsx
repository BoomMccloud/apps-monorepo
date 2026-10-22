import { describeAnalyticsBanner } from '@ens-apps/utils/testing/describeAnalyticsBanner'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AnalyticsBanner } from './AnalyticsBanner'

describeAnalyticsBanner({
  Banner: AnalyticsBanner,
  kit: { render, screen, press: (element) => userEvent.setup().click(element) },
})
