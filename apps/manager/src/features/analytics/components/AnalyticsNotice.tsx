import { NOT_CAPTURED_CLASS } from '@ens-apps/utils/analyticsConsent'
import {
  ANALYTICS_CHOICE_STATUS,
  ANALYTICS_NOTICE_HEADING,
  ANALYTICS_NOTICE_INTRO,
  ANALYTICS_NOTICE_SECTIONS,
  ANALYTICS_SWITCH_LABEL,
  type NoticeSection,
} from '@ens-apps/utils/analyticsConsentWording'
import { useAnalyticsConsent } from '@ens-apps/utils/useAnalyticsConsent'
import { useId } from 'react'
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

/** The analytics notice: what is collected, and the visitor's choice. */
export const AnalyticsNotice = () => {
  const { consent, accept, decline } = useAnalyticsConsent()
  const headingId = useId()
  const switchId = useId()

  return (
    <section aria-labelledby={headingId} className="mb-8">
      <h2 className="font-semibold text-ens-blue-dark text-xl" id={headingId}>
        {ANALYTICS_NOTICE_HEADING}
      </h2>
      {ANALYTICS_NOTICE_INTRO.map((paragraph) => (
        <p className="mt-4 text-gray-700" key={paragraph}>
          {paragraph}
        </p>
      ))}

      <div className={`mt-4 flex items-center gap-3 ${NOT_CAPTURED_CLASS}`}>
        <Switch
          checked={consent === 'granted'}
          disabled={consent === 'unknown'}
          id={switchId}
          onCheckedChange={(isChecked) => (isChecked ? accept() : decline())}
        />
        <label className="text-gray-700" htmlFor={switchId}>
          {ANALYTICS_SWITCH_LABEL}
        </label>
      </div>
      <p aria-live="polite" className="mt-2 text-gray-500 text-sm">
        {consent === 'unknown' ? null : ANALYTICS_CHOICE_STATUS[consent]}
      </p>

      {ANALYTICS_NOTICE_SECTIONS.map((section) => (
        <NoticeSectionView key={section.heading} section={section} />
      ))}
    </section>
  )
}
