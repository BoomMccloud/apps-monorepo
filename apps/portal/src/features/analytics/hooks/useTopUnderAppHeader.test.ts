// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTopUnderAppHeader } from './useTopUnderAppHeader'

vi.mock('@tanstack/react-router', () => ({
  useLocation: () => '/',
}))

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

describe('useTopUnderAppHeader', () => {
  afterEach(() => {
    document.body.replaceChildren()
    vi.restoreAllMocks()
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
})
