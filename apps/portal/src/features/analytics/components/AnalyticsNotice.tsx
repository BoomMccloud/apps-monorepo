import type { NoticeSection } from '@ens-apps/utils/analyticsConsentWording'
import { useAnalyticsNotice } from '@ens-apps/utils/useAnalyticsNotice'
import { Switch } from '@/components/ui/switch'

const NoticeSectionView = ({
  section,
}: {
  readonly section: NoticeSection
}) => (
  <>
    <h3 className="text-foreground text-h3">{section.heading}</h3>
    {section.paragraphs.map((paragraph) => (
      <p className="text-foreground text-p" key={paragraph}>
        {paragraph}
      </p>
    ))}
    {section.items.length > 0 ? (
      <ul className="flex list-disc flex-col gap-2 pl-6 text-foreground text-p">
        {section.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    ) : null}
    {section.mail ? (
      <p className="text-foreground text-p">
        {section.mail.before}{' '}
        <a
          className="underline underline-offset-4"
          href={`mailto:${section.mail.address}`}
        >
          {section.mail.address}
        </a>
        {section.mail.after}
      </p>
    ) : null}
  </>
)

/** The notice's analytics section: what is collected, and the visitor's choice. */
export const AnalyticsNotice = () => {
  const notice = useAnalyticsNotice()

  return (
    <section aria-labelledby={notice.headingId} className="flex flex-col gap-4">
      <h2 className="text-foreground text-h2" id={notice.headingId}>
        {notice.heading}
      </h2>
      {notice.intro.map((paragraph) => (
        <p className="text-foreground text-p" key={paragraph}>
          {paragraph}
        </p>
      ))}

      <div className={`flex items-center gap-3 ${notice.switch.wrapperClass}`}>
        <Switch
          checked={notice.switch.isOn}
          disabled={notice.switch.isDisabled}
          id={notice.switch.id}
          onCheckedChange={notice.switch.change}
        />
        <label className="text-base text-foreground" htmlFor={notice.switch.id}>
          {notice.switch.label}
        </label>
      </div>
      <p aria-live="polite" className="text-muted-foreground text-p">
        {notice.status}
      </p>

      {notice.sections.map((section) => (
        <NoticeSectionView key={section.heading} section={section} />
      ))}
    </section>
  )
}
