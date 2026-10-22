import type { NoticeSection } from '@ens-apps/utils/analyticsConsentWording'
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

/** The analytics notice: what is collected, and the visitor's choice. */
export const AnalyticsNotice = () => {
  const notice = useAnalyticsNotice()

  return (
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
  )
}
