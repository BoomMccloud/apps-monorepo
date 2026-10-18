import { useEffect } from 'react'
import { watchBottomBar } from './bottomBarClearance'

/**
 * Keeps the analytics banner above a bar fixed or stuck to the bottom of the
 * viewport for as long as the bar is mounted. Pass the bar's element, from a
 * ref callback kept in state, so the banner follows it when it appears.
 */
export const useBottomBarClearance = (bar: HTMLElement | null): void => {
  useEffect(() => (bar ? watchBottomBar(bar) : undefined), [bar])
}
