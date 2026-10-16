import { useAnalyticsConsent } from '@ens-apps/utils/analyticsConsentContext'
import { ANALYTICS_BANNER } from '@ens-apps/utils/analyticsConsentWording'
import { Link } from '@tanstack/react-router'
import { type CSSProperties, useId } from 'react'
import { Button } from '@/components/ui/button'
import { useTopUnderAppHeader } from '@/features/analytics/hooks/useTopUnderAppHeader'
import { cn } from '@/lib/utils'

/**
 * The analytics banner: a card floating over the page until the visitor
 * chooses, in either ENS app. On a phone it sits at the top, under the
 * app's header; from the `sm` width, in the bottom-right corner, away from
 * the sidebar's Help and Settings menus on the left. It stays under every
 * dialog, the wallet modal included.
 */
export const AnalyticsBanner = () => {
  const { consent, accept, decline } = useAnalyticsConsent()
  const headingId = useId()
  const isShown = consent === 'pending'
  const phoneTop = useTopUnderAppHeader(isShown)

  if (!isShown) return null

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        // top-(--phone-top): measured at run time under whichever app header
        // is on screen (useTopUnderAppHeader), so no spacing token can fit.
        'fixed inset-x-2.5 top-(--phone-top) z-40 flex flex-col gap-3 rounded-xl border border-border bg-background p-4 text-foreground shadow-lg',
        'sm:inset-x-auto sm:top-auto sm:right-6 sm:bottom-6 sm:w-80',
      )}
      style={{ '--phone-top': `${phoneTop}px` } as CSSProperties}
    >
      <h2 className="font-medium text-h3" id={headingId}>
        {ANALYTICS_BANNER.heading}
      </h2>
      <div className="flex flex-col gap-2 text-muted-foreground text-p">
        <p>{ANALYTICS_BANNER.intro}</p>
        <p>{ANALYTICS_BANNER.collected}</p>
        <p>{ANALYTICS_BANNER.shared}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          className="w-full"
          onClick={accept}
          type="button"
          variant="outline"
        >
          {ANALYTICS_BANNER.accept}
        </Button>
        <Button
          className="w-full"
          onClick={decline}
          type="button"
          variant="outline"
        >
          {ANALYTICS_BANNER.decline}
        </Button>
      </div>
      <Link
        className="self-start rounded-xs text-base underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        to="/privacy"
      >
        {ANALYTICS_BANNER.noticeLink}
      </Link>
    </section>
  )
}
