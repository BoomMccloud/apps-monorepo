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

/** The privacy policy's analytics section: what is collected, and the visitor's choice. */
export const AnalyticsNotice = () => {
  const { consent, accept, decline } = useAnalyticsConsent()
  const headingId = useId()
  const switchId = useId()

  return (
    <section
      aria-labelledby={headingId}
      className="mb-8 scroll-mt-24"
      id="analytics"
    >
      <h2 className="font-semibold text-ens-blue-dark text-xl" id={headingId}>
        {ANALYTICS_NOTICE_HEADING}
      </h2>
      {ANALYTICS_NOTICE_INTRO.map((paragraph) => (
        <p className="mt-4 text-gray-700" key={paragraph}>
          {paragraph}
        </p>
      ))}

      <div className="mt-4 flex items-center gap-3">
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

      <h3 className="mt-6 font-semibold text-ens-blue-dark text-lg">
        {ANALYTICS_NOTICE_COLLECTED_HEADING}
      </h3>
      <p className="mt-4 text-gray-700">{ANALYTICS_NOTICE_COLLECTED_LEAD}</p>
      <ul className="mt-4 list-disc space-y-2 pl-6 text-gray-700">
        {ANALYTICS_NOTICE_COLLECTED.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <h3 className="mt-6 font-semibold text-ens-blue-dark text-lg">
        {ANALYTICS_NOTICE_SHARING_HEADING}
      </h3>
      {ANALYTICS_NOTICE_SHARING.map((paragraph) => (
        <p className="mt-4 text-gray-700" key={paragraph}>
          {paragraph}
        </p>
      ))}

      <h3 className="mt-6 font-semibold text-ens-blue-dark text-lg">
        {ANALYTICS_NOTICE_PROCESSOR_HEADING}
      </h3>
      <p className="mt-4 text-gray-700">{ANALYTICS_NOTICE_PROCESSOR}</p>

      <h3 className="mt-6 font-semibold text-ens-blue-dark text-lg">
        {ANALYTICS_NOTICE_DELETION_HEADING}
      </h3>
      <p className="mt-4 text-gray-700">
        {ANALYTICS_NOTICE_DELETION.before}{' '}
        <a
          className="text-ens-blue hover:underline"
          href={`mailto:${ANALYTICS_NOTICE_DELETION_EMAIL}`}
        >
          {ANALYTICS_NOTICE_DELETION_EMAIL}
        </a>
        {ANALYTICS_NOTICE_DELETION.after}
      </p>
    </section>
  )
}
