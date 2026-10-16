import { useAnalyticsConsent } from '@ens-apps/utils/analyticsConsentContext'
import {
  ANALYTICS_CHOICE_STATUS,
  ANALYTICS_NOTICE_COLLECTED,
  ANALYTICS_NOTICE_COLLECTED_HEADING,
  ANALYTICS_NOTICE_COLLECTED_LEAD,
  ANALYTICS_NOTICE_DELETION,
  ANALYTICS_NOTICE_DELETION_EMAIL,
  ANALYTICS_NOTICE_DELETION_HEADING,
  ANALYTICS_NOTICE_HEADING,
  ANALYTICS_NOTICE_INTRO,
  ANALYTICS_NOTICE_PROCESSOR,
  ANALYTICS_NOTICE_PROCESSOR_HEADING,
  ANALYTICS_NOTICE_SHARING,
  ANALYTICS_NOTICE_SHARING_HEADING,
  ANALYTICS_SWITCH_LABEL,
} from '@ens-apps/utils/analyticsConsentWording'
import { useId } from 'react'
import { Switch } from '@/components/ui/switch'

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

      <div className="flex items-center gap-3">
        <Switch
          checked={consent === 'granted'}
          disabled={consent === 'unknown'}
          id={switchId}
          onCheckedChange={(checked) => (checked ? accept() : decline())}
        />
        <label className="text-base text-foreground" htmlFor={switchId}>
          {ANALYTICS_SWITCH_LABEL}
        </label>
      </div>
      <p aria-live="polite" className="text-muted-foreground text-p">
        {consent === 'unknown' ? null : ANALYTICS_CHOICE_STATUS[consent]}
      </p>

      <h3 className="text-foreground text-h3">
        {ANALYTICS_NOTICE_COLLECTED_HEADING}
      </h3>
      <p className="text-foreground text-p">
        {ANALYTICS_NOTICE_COLLECTED_LEAD}
      </p>
      <ul className="flex list-disc flex-col gap-2 pl-6 text-foreground text-p">
        {ANALYTICS_NOTICE_COLLECTED.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <h3 className="text-foreground text-h3">
        {ANALYTICS_NOTICE_SHARING_HEADING}
      </h3>
      {ANALYTICS_NOTICE_SHARING.map((paragraph) => (
        <p className="text-foreground text-p" key={paragraph}>
          {paragraph}
        </p>
      ))}

      <h3 className="text-foreground text-h3">
        {ANALYTICS_NOTICE_PROCESSOR_HEADING}
      </h3>
      <p className="text-foreground text-p">{ANALYTICS_NOTICE_PROCESSOR}</p>

      <h3 className="text-foreground text-h3">
        {ANALYTICS_NOTICE_DELETION_HEADING}
      </h3>
      <p className="text-foreground text-p">
        {ANALYTICS_NOTICE_DELETION.before}{' '}
        <a
          className="underline underline-offset-4"
          href={`mailto:${ANALYTICS_NOTICE_DELETION_EMAIL}`}
        >
          {ANALYTICS_NOTICE_DELETION_EMAIL}
        </a>
        {ANALYTICS_NOTICE_DELETION.after}
      </p>
    </section>
  )
}
