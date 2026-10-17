import { useRouter } from '@tanstack/react-router'
import {
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from 'react'

/**
 * The app's own headers, which a card floating at the top of a phone screen
 * must not cover: the sidebar pages' `MobileHeader` and the `HomeHeader` of
 * the pages without a sidebar.
 */
const APP_HEADER_SELECTOR = '[data-app-header]'

/**
 * Between the header and the card, and above the card once the header has
 * gone: the card's side inset (`inset-x-2.5`).
 */
const GAP_PX = 10

/** The lowest bottom edge on screen of a visible app header, 0 for none. */
const appHeaderBottom = (): number =>
  Math.max(
    0,
    ...Array.from(
      document.querySelectorAll(APP_HEADER_SELECTOR),
      (header) => header.getBoundingClientRect().bottom,
    ),
  )

const topUnderAppHeader = (): number => appHeaderBottom() + GAP_PX

/** The widths below Tailwind's `sm`, where the card floats at the top. */
const PHONE_WIDTHS = '(max-width: 39.99rem)'

const subscribeToPhoneWidths = (onChange: () => void): (() => void) => {
  const widths = window.matchMedia(PHONE_WIDTHS)
  widths.addEventListener('change', onChange)
  return () => widths.removeEventListener('change', onChange)
}

const isPhoneWidth = (): boolean => window.matchMedia(PHONE_WIDTHS).matches

const isNeverPhoneWidth = (): boolean => false

/**
 * The top for a card floating at the top of a phone screen: under the app's
 * header while the header is on screen, rising to the top as it scrolls
 * away. The home page's header sits below the Sepolia notice, so no fixed
 * offset clears it. Measured while `isActive` at a phone's width, and again
 * when a page has rendered and on scroll, resize and a change of layout; from
 * the `sm` width the card sits in a corner and nothing is measured.
 */
export const useTopUnderAppHeader = (isActive: boolean): number => {
  const [top, setTop] = useState(GAP_PX)
  const isPhone = useSyncExternalStore(
    subscribeToPhoneWidths,
    isPhoneWidth,
    isNeverPhoneWidth,
  )
  const isTracking = isActive && isPhone
  const router = useRouter()

  // Measured before the card is first painted.
  useLayoutEffect(() => {
    if (isTracking) setTop(topUnderAppHeader())
  }, [isTracking])

  useEffect(() => {
    if (!isTracking) return
    // At most one measurement per frame, however often the page scrolls.
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setTop(topUnderAppHeader()))
    }
    const layout = new ResizeObserver(measure)
    layout.observe(document.body)
    // A new page brings its own header.
    const stopWatchingPages = router.subscribe('onRendered', measure)
    window.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(frame)
      layout.disconnect()
      stopWatchingPages()
      window.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
    }
  }, [isTracking, router])

  return top
}
