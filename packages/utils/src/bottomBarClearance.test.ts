// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BOTTOM_BAR_CLEARANCE_PROPERTY,
  watchBottomBar,
} from './bottomBarClearance'

const VIEWPORT_HEIGHT = 800

const clearance = (): string =>
  document.documentElement.style.getPropertyValue(BOTTOM_BAR_CLEARANCE_PROPERTY)

// A bar that ends at the bottom of the viewport and is `height` tall, or one
// that is not shown (`display: none` gives it no height).
const barOf = (height: number, bottomGap = 0): HTMLElement => {
  const bar = document.createElement('div')
  vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue({
    height,
    top: VIEWPORT_HEIGHT - bottomGap - height,
  } as DOMRect)
  document.body.append(bar)
  return bar
}

// Every bar a test watches is let go after it, so that none counts in the next.
const stops: Array<() => void> = []
const watch = (bar: HTMLElement): (() => void) => {
  const stop = watchBottomBar(bar)
  stops.push(stop)
  return stop
}

class FakeResizeObserver {
  static readonly instances: FakeResizeObserver[] = []
  disconnected = false
  constructor(readonly callback: () => void) {
    FakeResizeObserver.instances.push(this)
  }
  observe(): void {}
  disconnect(): void {
    this.disconnected = true
  }
}

describe('watchBottomBar', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('innerHeight', VIEWPORT_HEIGHT)
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    FakeResizeObserver.instances.length = 0
  })

  afterEach(() => {
    for (const stop of stops.splice(0)) stop()
    document.body.replaceChildren()
    document.documentElement.style.removeProperty(BOTTOM_BAR_CLEARANCE_PROPERTY)
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('publishes the space the bar takes at the bottom, and gives it back when it is no longer watched', () => {
    const stop = watch(barOf(90))

    expect(clearance()).toBe('90px')

    stop()

    expect(clearance()).toBe('0px')
  })

  it('counts the gap a bar keeps from the bottom of the viewport', () => {
    watch(barOf(58, 24))

    expect(clearance()).toBe('82px')
  })

  it('publishes nothing for a bar that is not shown', () => {
    watch(barOf(0))

    expect(clearance()).toBe('0px')
  })

  it('publishes nothing for a bar below the viewport', () => {
    watch(barOf(90, -300))

    expect(clearance()).toBe('0px')
  })

  it('keeps clear of the highest of the bars watched, and of the one left when it goes', () => {
    const stopLow = watch(barOf(60))
    const stopHigh = watch(barOf(140))

    expect(clearance()).toBe('140px')

    stopHigh()

    expect(clearance()).toBe('60px')

    stopLow()

    expect(clearance()).toBe('0px')
  })

  it('measures again after the bar is resized, once the resizing settles', () => {
    const bar = barOf(90)
    watch(bar)
    vi.mocked(bar.getBoundingClientRect).mockReturnValue({
      height: 140,
      top: VIEWPORT_HEIGHT - 140,
    } as DOMRect)

    FakeResizeObserver.instances[0]?.callback()
    FakeResizeObserver.instances[0]?.callback()

    expect(clearance()).toBe('90px')

    vi.advanceTimersByTime(100)

    expect(clearance()).toBe('140px')
  })

  it('measures again when the window is resized or any part of the page scrolls, as a bar that sticks to the bottom moves', () => {
    const bar = barOf(90, 400)
    watch(bar)
    expect(clearance()).toBe('490px')
    vi.mocked(bar.getBoundingClientRect).mockReturnValue({
      height: 90,
      top: VIEWPORT_HEIGHT - 90,
    } as DOMRect)

    window.dispatchEvent(new Event('resize'))
    vi.advanceTimersByTime(100)
    expect(clearance()).toBe('90px')

    vi.mocked(bar.getBoundingClientRect).mockReturnValue({
      height: 90,
      top: VIEWPORT_HEIGHT - 190,
    } as DOMRect)
    const scroller = document.createElement('main')
    document.body.append(scroller)
    scroller.dispatchEvent(new Event('scroll'))
    vi.advanceTimersByTime(100)

    expect(clearance()).toBe('190px')
  })

  it('stops measuring when it is no longer watched', () => {
    const bar = barOf(90)
    const stop = watch(bar)
    stop()
    vi.mocked(bar.getBoundingClientRect).mockClear()

    window.dispatchEvent(new Event('resize'))
    vi.advanceTimersByTime(100)

    expect(bar.getBoundingClientRect).not.toHaveBeenCalled()
    expect(FakeResizeObserver.instances[0]?.disconnected).toBe(true)
  })

  it('still publishes where the browser has no resize observer', () => {
    vi.stubGlobal('ResizeObserver', undefined)

    watch(barOf(90))

    expect(clearance()).toBe('90px')
  })
})
