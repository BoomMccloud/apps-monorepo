import { createFileRoute } from '@tanstack/react-router'
import { PrivacyNoticePage } from '@/features/analytics/pages/PrivacyNoticePage'

export const Route = createFileRoute('/privacy')({
  component: PrivacyNoticePage,
  staticData: { hideSidebar: true },
})
