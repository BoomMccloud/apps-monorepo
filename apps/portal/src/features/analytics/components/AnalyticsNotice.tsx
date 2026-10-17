import { NOT_CAPTURED_CLASS } from '@ens-apps/utils/analyticsConsent'
import { useAnalyticsConsent } from '@ens-apps/utils/analyticsConsentContext'
import {
  ANALYTICS_CHOICE_STATUS,
  ANALYTICS_NOTICE_HEADING,
  ANALYTICS_NOTICE_INTRO,
  ANALYTICS_NOTICE_SECTIONS,
  ANALYTICS_SWITCH_LABEL,
  type NoticeSection,
} from '@ens-apps/utils/analyticsConsentWording'
import { useId } from 'react'
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
  const { consent, accept, decline } = useAnalyticsConsent()
  const headingId = useId()
  const switchId = useId()

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <h2 className="text-foreground text-h2" id={headingId}>
        {ANALYTICS_NOTICE_HEADING}
      </h2>
      {ANALYTICS_NOTICE_INTRO.map((paragraph) => (
        <p className="text-foreground text-p" key={paragraph}>
          {paragraph}
        </p>
      ))}

      <div className={`flex items-center gap-3 ${NOT_CAPTURED_CLASS}`}>
        <Switch
          checked={consent === 'granted'}
          disabled={consent === 'unknown'}
          id={switchId}
          onCheckedChange={(isChecked) => (isChecked ? accept() : decline())}
        />
        <label className="text-base text-foreground" htmlFor={switchId}>
          {ANALYTICS_SWITCH_LABEL}
        </label>
      </div>
      <p aria-live="polite" className="text-muted-foreground text-p">
        {consent === 'unknown' ? null : ANALYTICS_CHOICE_STATUS[consent]}
      </p>

      {ANALYTICS_NOTICE_SECTIONS.map((section) => (
        <NoticeSectionView key={section.heading} section={section} />
      ))}
    </section>
  )
}
