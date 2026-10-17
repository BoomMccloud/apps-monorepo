// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTopUnderAppHeader } from './useTopUnderAppHeader'

const router = vi.hoisted(() => ({
  subscribe: vi.fn<(event: string, onEvent: () => void) => () => void>(
    () => () => {},
  ),
}))
vi.mock('@tanstack/react-router', () => ({ useRouter: () => router }))

/** An app header whose bottom edge sits where the test says, on screen. */
const appHeader = (bottom: number) => {
  const header = document.createElement('header')
  header.setAttribute('data-app-header', '')
  document.body.appendChild(header)
  const rect = vi
    .spyOn(header, 'getBoundingClientRect')
    .mockReturnValue({ bottom } as DOMRect)
  return {
    moveTo: (nextBottom: number) =>
      rect.mockReturnValue({ bottom: nextBottom } as DOMRect),
  }
}

const scroll = () =>
  act(() => {
    window.dispatchEvent(new Event('scroll'))
  })

/** happy-dom's own control of the screen, which the DOM types do not know. */
const { happyDOM } = window as unknown as {
  readonly happyDOM: {
    setViewport(viewport: {
      readonly width: number
      readonly height: number
    }): Promise<void>
  }
}

const screenWidth = (width: number) =>
  act(async () => {
    await happyDOM.setViewport({ width, height: 780 })
  })

const PHONE_WIDTH = 360
const DESKTOP_WIDTH = 1280

describe('useTopUnderAppHeader', () => {
  beforeEach(() => screenWidth(PHONE_WIDTH))

  afterEach(async () => {
    document.body.replaceChildren()
    vi.restoreAllMocks()
    await screenWidth(DESKTOP_WIDTH)
  })

  it('puts the card under the app header on screen', () => {
    appHeader(360)

    const { result } = renderHook(() => useTopUnderAppHeader(true))

    expect(result.current).toBe(370)
  })

  it('follows the header as it scrolls, and keeps the card at the top once it has gone', async () => {
    const header = appHeader(360)
    const { result } = renderHook(() => useTopUnderAppHeader(true))

    header.moveTo(120)
    await scroll()
    await waitFor(() => expect(result.current).toBe(130))

    header.moveTo(-200)
    await scroll()
    await waitFor(() => expect(result.current).toBe(10))
  })

  it('measures the header of a page that has just rendered', async () => {
    appHeader(360)
    const { result } = renderHook(() => useTopUnderAppHeader(true))
    expect(router.subscribe).toHaveBeenCalledWith(
      'onRendered',
      expect.any(Function),
    )
    const [, pageRendered] = router.subscribe.mock.calls.at(-1) ?? []

    document.body.replaceChildren()
    appHeader(56)
    act(() => pageRendered?.())

    await waitFor(() => expect(result.current).toBe(66))
  })

  it('clears the lowest of the headers shown, and sits at the top with none', () => {
    appHeader(56)
    appHeader(0)
    const { result } = renderHook(() => useTopUnderAppHeader(true))
    expect(result.current).toBe(66)

    document.body.replaceChildren()
    const { result: withoutHeader } = renderHook(() =>
      useTopUnderAppHeader(true),
    )
    expect(withoutHeader.current).toBe(10)
  })

  it('stops measuring once the card is gone', async () => {
    const header = appHeader(360)
    const { result, rerender } = renderHook(
      ({ isActive }) => useTopUnderAppHeader(isActive),
      { initialProps: { isActive: true } },
    )

    rerender({ isActive: false })
    header.moveTo(-200)
    await scroll()
    await new Promise((resolve) => requestAnimationFrame(resolve))

    expect(result.current).toBe(370)
  })

  it('measures nothing at the widths where the card sits in a corner', async () => {
    await screenWidth(DESKTOP_WIDTH)
    const header = appHeader(360)
    const addListener = vi.spyOn(window, 'addEventListener')

    const { result } = renderHook(() => useTopUnderAppHeader(true))
    header.moveTo(120)
    await scroll()
    await new Promise((resolve) => requestAnimationFrame(resolve))

    expect(result.current).toBe(10)
    expect(addListener).not.toHaveBeenCalledWith(
      'scroll',
      expect.anything(),
      expect.anything(),
    )
  })

  it('starts following the header when the screen narrows to a phone', async () => {
    await screenWidth(DESKTOP_WIDTH)
    appHeader(360)
    const { result } = renderHook(() => useTopUnderAppHeader(true))
    expect(result.current).toBe(10)

    await screenWidth(PHONE_WIDTH)

    await waitFor(() => expect(result.current).toBe(370))
  })
})
