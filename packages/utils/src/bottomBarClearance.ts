/**
 * Keeps the analytics banner above a bar fixed or stuck to the bottom of the
 * viewport, so the card never covers the bar's controls.
 *
 * A bar is watched while it is on the page. The space it takes at the bottom,
 * from the top of the bar to the bottom of the viewport, is published as the
 * `--bottom-bar-clearance` property on the page, and the banner adds it to its
 * own distance from the bottom. With several bars the highest counts.
 */

/** The property the banner reads; `0px` while no bar is watched. */
export const BOTTOM_BAR_CLEARANCE_PROPERTY = '--bottom-bar-clearance'

const SETTLE_MS = 100

// The space each bar being watched takes, in px. This module's own state, read
// by nothing else.
const clearances = new Map<HTMLElement, number>()

const publish = (): void => {
  document.documentElement.style.setProperty(
    BOTTOM_BAR_CLEARANCE_PROPERTY,
    `${Math.max(0, ...clearances.values())}px`,
  )
}

const clearanceOf = (bar: HTMLElement): number => {
  const { height, top } = bar.getBoundingClientRect()
  return height === 0 ? 0 : Math.max(0, Math.round(window.innerHeight - top))
}

/**
 * Watch a bar until the returned function is called. It is measured now, when
 * it is resized, when the window is, and when any part of the page scrolls,
 * since a bar that sticks to the bottom moves while the page scrolls under it.
 */
export const watchBottomBar = (bar: HTMLElement): (() => void) => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const apply = (): void => {
    clearances.set(bar, clearanceOf(bar))
    publish()
  }
  const schedule = (): void => {
    clearTimeout(timer)
    timer = setTimeout(apply, SETTLE_MS)
  }

  apply()
  const observer =
    typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver(schedule)
  observer?.observe(bar)
  window.addEventListener('resize', schedule)
  window.addEventListener('scroll', schedule, { capture: true, passive: true })

  return () => {
    clearTimeout(timer)
    observer?.disconnect()
    window.removeEventListener('resize', schedule)
    window.removeEventListener('scroll', schedule, { capture: true })
    clearances.delete(bar)
    publish()
  }
}
