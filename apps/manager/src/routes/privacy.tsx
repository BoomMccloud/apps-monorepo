import { createFileRoute } from '@tanstack/react-router'
import { PrivacySettingsPage } from '@/features/analytics/pages/PrivacySettingsPage'
import { defaultOgImageUrl, seo } from '@/utils/seo'

export const Route = createFileRoute('/privacy')({
  head: () => ({
    meta: seo({
      title: 'Privacy settings - ENS App',
      description: 'Choose whether the ENS app may use analytics.',
      image: defaultOgImageUrl(),
    }),
  }),
  component: PrivacySettingsPage,
})
