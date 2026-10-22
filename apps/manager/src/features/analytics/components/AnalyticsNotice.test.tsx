import { describeAnalyticsNotice } from '@ens-apps/utils/testing/describeAnalyticsNotice'
import { fireEvent, render, screen } from '@testing-library/react'
import { AnalyticsNotice } from './AnalyticsNotice'

describeAnalyticsNotice({
  Notice: AnalyticsNotice,
  kit: { render, screen, press: (element) => fireEvent.click(element) },
})
