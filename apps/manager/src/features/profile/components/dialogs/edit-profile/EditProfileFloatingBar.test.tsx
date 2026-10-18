import { BOTTOM_BAR_CLEARANCE_PROPERTY } from '@ens-apps/utils/bottomBarClearance'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '@/utils/test-utils'
import { EditProfileFloatingBar } from './EditProfileFloatingBar'

const BAR_HEIGHT = 80

const clearance = () =>
  document.documentElement.style.getPropertyValue(BOTTOM_BAR_CLEARANCE_PROPERTY)

describe('EditProfileFloatingBar', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.documentElement.style.removeProperty(BOTTOM_BAR_CLEARANCE_PROPERTY)
  })

  it('keeps the analytics banner above the bar while it is shown', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      height: BAR_HEIGHT,
      top: window.innerHeight - BAR_HEIGHT,
    } as DOMRect)

    const { unmount } = render(
      <EditProfileFloatingBar
        isOpen={false}
        onEscape={vi.fn()}
        rightActions={<button type="button">Save</button>}
      >
        <p>Editor</p>
      </EditProfileFloatingBar>,
    )

    expect(clearance()).toBe(`${BAR_HEIGHT}px`)

    unmount()

    expect(clearance()).toBe('0px')
  })
})
