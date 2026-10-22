import { describeAnalyticsBanner } from '@ens-apps/utils/testing/describeAnalyticsBanner'
import { fireEvent, render, screen } from '@testing-library/react'
import { AnalyticsBanner } from './AnalyticsBanner'

describeAnalyticsBanner({
  Banner: AnalyticsBanner,
  kit: { render, screen, press: (element) => fireEvent.click(element) },
})
