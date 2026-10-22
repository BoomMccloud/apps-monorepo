import { describePrivacySettingsPage } from '@ens-apps/utils/testing/describePrivacySettingsPage'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AnchorHTMLAttributes } from 'react'
import { vi } from 'vitest'
import { PrivacySettingsPage } from './PrivacySettingsPage'

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: ({
    children,
    to,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { readonly to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

describePrivacySettingsPage({
  Page: PrivacySettingsPage,
  kit: { render, screen, press: (element) => userEvent.setup().click(element) },
})
