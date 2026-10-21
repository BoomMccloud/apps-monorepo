import { PRIVACY_POLICY_URL } from '@ens-apps/utils/analyticsConsentWording'
import { AnalyticsNotice } from '../components/AnalyticsNotice'

/**
 * Privacy settings: where a visitor changes the analytics choice, with the
 * notice that says what it covers. The privacy policy itself is ens.domains'
 * page, one link away.
 */
export const PrivacySettingsPage = () => (
  <div className="mx-auto max-w-4xl px-4 py-8 md:px-8 md:py-12">
    <article>
      <h1 className="mb-6 font-bold text-3xl text-ens-blue-dark md:text-4xl">
        Privacy settings
      </h1>
      <AnalyticsNotice />
      <p className="text-gray-700">
        <a
          className="text-ens-blue hover:underline"
          href={PRIVACY_POLICY_URL}
          rel="noopener noreferrer"
          target="_blank"
        >
          Read the full privacy policy
        </a>
      </p>
    </article>
  </div>
)
