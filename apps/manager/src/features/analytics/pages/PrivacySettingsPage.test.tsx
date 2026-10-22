import { describePrivacySettingsPage } from '@ens-apps/utils/testing/describePrivacySettingsPage'
import { fireEvent, render, screen } from '@testing-library/react'
import { PrivacySettingsPage } from './PrivacySettingsPage'

describePrivacySettingsPage({
  Page: PrivacySettingsPage,
  kit: { render, screen, press: (element) => fireEvent.click(element) },
})
