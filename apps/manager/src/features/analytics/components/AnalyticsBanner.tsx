import { useAnalyticsConsent } from '@ens-apps/utils/analytics-consent-context'
import { ANALYTICS_BANNER } from '@ens-apps/utils/analytics-consent-wording'
import { Link } from '@tanstack/react-router'
import { useId } from 'react'
import { Button } from '@/components/ui/button'
import { floatingWrapperGlassClassName } from '@/features/navigation/Header/shared/FloatingWrapper'
import { cn } from '@/lib/utils'

/**
 * The analytics banner: a card floating over the page until the visitor
 * chooses, in either ENS app. On a phone it sits at the top, under the
 * header; from 480 px wide, in the bottom-left corner, clear of the toasts
 * on the right. It stays under every dialog, the wallet modal included.
 */
export const AnalyticsBanner = () => {
  const { consent, accept, decline } = useAnalyticsConsent()
  const headingId = useId()

  if (consent !== 'pending') return null

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'fixed inset-x-2.5 top-18 z-40 flex flex-col gap-3 rounded-xl p-4 shadow-lg',
        'xs:inset-x-auto xs:top-auto xs:bottom-6 xs:left-6 xs:w-80',
        floatingWrapperGlassClassName,
      )}
    >
      <h2 className="font-medium text-base text-foreground" id={headingId}>
        {ANALYTICS_BANNER.heading}
      </h2>
      <div className="flex flex-col gap-2 text-muted-foreground text-sm">
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
        className="self-start text-ens-blue text-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        hash="analytics"
        to="/legal/privacy-policy"
      >
        {ANALYTICS_BANNER.noticeLink}
      </Link>
    </section>
  )
}
