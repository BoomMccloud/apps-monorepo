import { useAnalyticsBanner } from '@ens-apps/utils/useAnalyticsBanner'
import { Button } from '@/components/ui/button'
import { floatingWrapperGlassClassName } from '@/features/navigation/Header/shared/FloatingWrapper'
import { cn } from '@/lib/utils'

/**
 * The analytics banner: a card floating over the page until the visitor
 * chooses, in either ENS app. On a phone it sits at the bottom of the
 * screen, where a thumb reaches it; from 480 px wide, in the bottom-left
 * corner, clear of the toasts on the right. It stays under every dialog, the
 * wallet modal included.
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
        'fixed inset-x-2.5 bottom-[calc(0.625rem+env(safe-area-inset-bottom,0px))] z-40 flex flex-col gap-3 rounded-xl p-4 shadow-lg',
        'xs:inset-x-auto xs:bottom-6 xs:left-6 xs:w-88',
        floatingWrapperGlassClassName,
      )}
    >
      <h2
        className="font-medium text-base text-foreground"
        id={banner.headingId}
      >
        {banner.heading}
      </h2>
      <div className="flex flex-col gap-2 text-muted-foreground text-sm">
        {banner.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      {/* Stacked on a phone, side by side from xs */}
      <div className="flex xs:grid xs:grid-cols-2 flex-col gap-2">
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
      <a
        className="self-start text-ens-blue text-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        href={banner.policy.href}
        rel="noopener noreferrer"
        target="_blank"
      >
        {banner.policy.label}
      </a>
    </section>
  )
}
