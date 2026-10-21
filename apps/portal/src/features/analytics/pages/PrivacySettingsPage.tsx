import { PRIVACY_POLICY_URL } from '@ens-apps/utils/analyticsConsentWording'
import { ExternalLink } from 'react-external-link'
import { HomeHeader } from '@/features/dashboard/components'
import { AnalyticsNotice } from '../components/AnalyticsNotice'

/** The Explorer's Privacy settings: its analytics, and the visitor's choice. */
export const PrivacySettingsPage = () => (
  <main className="flex min-h-screen flex-col items-center gap-10 px-6 pt-6 pb-18">
    <HomeHeader />
    <article className="flex w-full max-w-175 flex-col gap-8">
      <h1 className="text-foreground text-h1">Privacy settings</h1>
      <AnalyticsNotice />
      <p className="text-foreground text-p">
        <ExternalLink
          className="underline underline-offset-4"
          href={PRIVACY_POLICY_URL}
        >
          Read the full privacy policy
        </ExternalLink>
      </p>
    </article>
  </main>
)
