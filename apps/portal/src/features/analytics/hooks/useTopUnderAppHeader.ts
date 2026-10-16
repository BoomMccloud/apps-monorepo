import { useLocation } from '@tanstack/react-router'
import { useEffect, useLayoutEffect, useState } from 'react'

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

/**
 * The top for a card floating at the top of a phone screen: under the app's
 * header while the header is on screen, rising to the top as it scrolls
 * away. The home page's header sits below the Sepolia notice, so no fixed
 * offset clears it. Measured on every render while `isActive`, and again on
 * scroll, resize and a change of layout.
 */
export const useTopUnderAppHeader = (isActive: boolean): number => {
  const [top, setTop] = useState(GAP_PX)
  // A new page brings its own header: render again, then measure it.
  useLocation({ select: (location) => location.href })

  useLayoutEffect(() => {
    if (isActive) setTop(topUnderAppHeader())
  })

  useEffect(() => {
    if (!isActive) return
    // At most one measurement per frame, however often the page scrolls.
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setTop(topUnderAppHeader()))
    }
    const layout = new ResizeObserver(measure)
    layout.observe(document.body)
    window.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(frame)
      layout.disconnect()
      window.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
    }
  }, [isActive])

  return top
}
