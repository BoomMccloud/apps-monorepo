import { BOTTOM_BAR_CLEARANCE_PROPERTY } from '@ens-apps/utils/bottomBarClearance'
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PendingChangesBar } from './PendingChangesBar'

const BAR_HEIGHT = 58
const BAR_GAP = 24

const clearance = () =>
  document.documentElement.style.getPropertyValue(BOTTOM_BAR_CLEARANCE_PROPERTY)

const renderBar = (
  props: Partial<Parameters<typeof PendingChangesBar>[0]> = {},
) =>
  render(
    <PendingChangesBar
      changesCount={1}
      onDiscard={vi.fn()}
      onSave={vi.fn()}
      updatesCount={1}
      {...props}
    />,
  )

describe('PendingChangesBar', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      height: BAR_HEIGHT,
      top: window.innerHeight - BAR_GAP - BAR_HEIGHT,
    } as DOMRect)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.documentElement.style.removeProperty(BOTTOM_BAR_CLEARANCE_PROPERTY)
  })

  it.each([
    ['there are changes to save', {}],
    ['it is waiting for the indexer', { isSyncing: true }],
    ['saving failed', { errorMessage: 'The transaction was rejected' }],
  ])('keeps the analytics banner above the bar when %s, and lets go of it after', (_when, props) => {
    const { unmount } = renderBar(props)

    expect(clearance()).toBe(`${BAR_HEIGHT + BAR_GAP}px`)

    unmount()

    expect(clearance()).toBe('0px')
  })

  it('takes no space when there is nothing to save', () => {
    renderBar({ changesCount: 0, updatesCount: 0 })

    expect(clearance()).toBe('')
  })
})
