import { createFileRoute } from '@tanstack/react-router'
import { PrivacySettingsPage } from '@/features/analytics/pages/PrivacySettingsPage'

export const Route = createFileRoute('/privacy')({
  component: PrivacySettingsPage,
  staticData: { hideSidebar: true },
})
