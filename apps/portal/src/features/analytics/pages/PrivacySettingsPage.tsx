import {
  type NoticeSection,
  PRIVACY_POLICY_URL,
} from '@ens-apps/utils/analyticsConsentWording'
import { useAnalyticsNotice } from '@ens-apps/utils/useAnalyticsNotice'
import { ExternalLink } from 'react-external-link'
import { Switch } from '@/components/ui/switch'
import { HomeHeader } from '@/features/dashboard/components'

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

/** The Explorer's Privacy settings: its analytics, and the visitor's choice. */
export const PrivacySettingsPage = () => {
  const notice = useAnalyticsNotice()

  return (
    <main className="flex min-h-screen flex-col items-center gap-10 px-6 pt-6 pb-18">
      <HomeHeader />
      <article className="flex w-full max-w-175 flex-col gap-8">
        <h1 className="text-foreground text-h1">Privacy settings</h1>
        <section
          aria-labelledby={notice.headingId}
          className="flex flex-col gap-4"
        >
          <h2 className="text-foreground text-h2" id={notice.headingId}>
            {notice.heading}
          </h2>
          {notice.intro.map((paragraph) => (
            <p className="text-foreground text-p" key={paragraph}>
              {paragraph}
            </p>
          ))}

          <div
            className={`flex items-center gap-3 ${notice.switch.wrapperClass}`}
          >
            <Switch
              checked={notice.switch.isOn}
              disabled={notice.switch.isDisabled}
              id={notice.switch.id}
              onCheckedChange={notice.switch.change}
            />
            <label
              className="text-base text-foreground"
              htmlFor={notice.switch.id}
            >
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
}
