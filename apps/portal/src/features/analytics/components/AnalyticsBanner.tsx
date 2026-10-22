import { useAnalyticsBanner } from '@ens-apps/utils/useAnalyticsBanner'
import { ExternalLink } from 'react-external-link'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * The analytics banner: a card floating over the page until the visitor
 * chooses, in either ENS app. On a phone it sits at the bottom of the
 * screen, where a thumb reaches it; from the `sm` width, in the bottom-right
 * corner, away from the sidebar's Help and Settings menus on the left. It
 * stays under every dialog, the wallet modal included.
 */
export const AnalyticsBanner = () => {
  const banner = useAnalyticsBanner()

  if (!banner.isShown) return null

  return (
    <section
      aria-labelledby={banner.headingId}
      className={cn(
        // greptile: no-arbitrary-tailwind: the gap above the bottom edge is the
        // gap at the sides plus the device's safe area, which only the browser
        // knows, so no spacing token fits.
        'fixed inset-x-2.5 bottom-[calc(0.625rem+env(safe-area-inset-bottom,0px))] z-40 flex flex-col gap-3 rounded-xl border border-border bg-background p-4 text-foreground shadow-lg',
        'sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-88',
      )}
    >
      <h2 className="font-medium text-h3" id={banner.headingId}>
        {banner.heading}
      </h2>
      <div className="flex flex-col gap-2 text-muted-foreground text-p">
        {banner.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      {/* Stacked on a phone, side by side from sm */}
      <div className="flex flex-col gap-2 sm:grid sm:grid-cols-2">
        <Button
          className="w-full"
          onClick={banner.accept.press}
          type="button"
          variant="outline"
        >
          {banner.accept.label}
        </Button>
        <Button
          className="w-full"
          onClick={banner.decline.press}
          type="button"
          variant="outline"
        >
          {banner.decline.label}
        </Button>
      </div>
      <ExternalLink
        className="self-start rounded-xs text-base underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        href={banner.policy.href}
      >
        {banner.policy.label}
      </ExternalLink>
    </section>
  )
}
