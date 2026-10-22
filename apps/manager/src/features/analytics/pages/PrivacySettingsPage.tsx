import {
  type NoticeSection,
  PRIVACY_POLICY_URL,
  PRIVACY_SETTINGS_PAGE,
} from '@ens-apps/utils/analyticsConsentWording'
import { useAnalyticsNotice } from '@ens-apps/utils/useAnalyticsNotice'
import { Switch } from '@/components/ui/switch'

const NoticeSectionView = ({
  section,
}: {
  readonly section: NoticeSection
}) => (
  <>
    <h3 className="mt-6 font-semibold text-ens-blue-dark text-lg">
      {section.heading}
    </h3>
    {section.paragraphs.map((paragraph) => (
      <p className="mt-4 text-gray-700" key={paragraph}>
        {paragraph}
      </p>
    ))}
    {section.items.length > 0 ? (
      <ul className="mt-4 list-disc space-y-2 pl-6 text-gray-700">
        {section.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    ) : null}
    {section.mail ? (
      <p className="mt-4 text-gray-700">
        {section.mail.before}{' '}
        <a
          className="text-ens-blue hover:underline"
          href={`mailto:${section.mail.address}`}
        >
          {section.mail.address}
        </a>
        {section.mail.after}
      </p>
    ) : null}
  </>
)

/**
 * Privacy settings: where a visitor changes the analytics choice, with the
 * notice that says what it covers. The privacy policy itself is ens.domains'
 * page, one link away.
 */
export const PrivacySettingsPage = () => {
  const notice = useAnalyticsNotice()

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8 md:py-12">
      <article>
        <h1 className="mb-6 font-bold text-3xl text-ens-blue-dark md:text-4xl">
          {PRIVACY_SETTINGS_PAGE.heading}
        </h1>
        <section aria-labelledby={notice.headingId} className="mb-8">
          <h2
            className="font-semibold text-ens-blue-dark text-xl"
            id={notice.headingId}
          >
            {notice.heading}
          </h2>
          {notice.intro.map((paragraph) => (
            <p className="mt-4 text-gray-700" key={paragraph}>
              {paragraph}
            </p>
          ))}

          <div
            className={`mt-4 flex items-center gap-3 ${notice.switch.wrapperClass}`}
          >
            <Switch
              checked={notice.switch.isOn}
              disabled={notice.switch.isDisabled}
              id={notice.switch.id}
              onCheckedChange={notice.switch.change}
            />
            <label className="text-gray-700" htmlFor={notice.switch.id}>
              {notice.switch.label}
            </label>
          </div>
          <p aria-live="polite" className="mt-2 text-gray-500 text-sm">
            {notice.status}
          </p>

          {notice.sections.map((section) => (
            <NoticeSectionView key={section.heading} section={section} />
          ))}
        </section>
        <p className="text-gray-700">
          <a
            className="text-ens-blue hover:underline"
            href={PRIVACY_POLICY_URL}
            rel="noopener noreferrer"
            target="_blank"
          >
            {PRIVACY_SETTINGS_PAGE.policyLink}
          </a>
        </p>
      </article>
    </div>
  )
}
