import { describeAnalyticsNotice } from '@ens-apps/utils/testing/describeAnalyticsNotice'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AnalyticsNotice } from './AnalyticsNotice'

describeAnalyticsNotice({
  Notice: AnalyticsNotice,
  kit: { render, screen, press: (element) => userEvent.setup().click(element) },
})
