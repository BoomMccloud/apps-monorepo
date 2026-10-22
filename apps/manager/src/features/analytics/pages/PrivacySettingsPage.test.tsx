import { describeAnalyticsNotice } from '@ens-apps/utils/testing/describeAnalyticsNotice'
import { describePrivacySettingsPage } from '@ens-apps/utils/testing/describePrivacySettingsPage'
import { fireEvent, render, screen } from '@testing-library/react'
import { PrivacySettingsPage } from './PrivacySettingsPage'

const kit = {
  render,
  screen,
  press: (element: HTMLElement) => fireEvent.click(element),
}

describeAnalyticsNotice({ Notice: PrivacySettingsPage, kit })
describePrivacySettingsPage({ Page: PrivacySettingsPage, kit })
