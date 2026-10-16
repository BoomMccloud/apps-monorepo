import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useConnection } from 'wagmi'
import { useIsConnectionSettled } from './useIsConnectionSettled'

vi.mock('wagmi', () => ({ useConnection: vi.fn() }))

type Status = ReturnType<typeof useConnection>['status']

const reports = (status: Status) =>
  vi
    .mocked(useConnection)
    .mockReturnValue({ status } as unknown as ReturnType<typeof useConnection>)

// wagmi's states, in the order it reports them while a page loads.
const renderSettled = (first: Status) => {
  reports(first)
  const view = renderHook(() => useIsConnectionSettled())
  return {
    isSettled: () => view.result.current,
    next: (status: Status) => {
      reports(status)
      view.rerender()
    },
  }
}

describe('useIsConnectionSettled', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('is not settled at the first "disconnected", which wagmi reports before it has restored anything', () => {
    const connection = renderSettled('disconnected')
    expect(connection.isSettled()).toBe(false)

    connection.next('disconnected')
    expect(connection.isSettled()).toBe(false)
  })

  it('is settled once the restore has run and ended connected', () => {
    const connection = renderSettled('disconnected')

    connection.next('reconnecting')
    expect(connection.isSettled()).toBe(false)

    connection.next('connected')
    expect(connection.isSettled()).toBe(true)
  })

  it('is settled once the restore has run and found no wallet', () => {
    const connection = renderSettled('disconnected')

    connection.next('connecting')
    expect(connection.isSettled()).toBe(false)

    connection.next('disconnected')
    expect(connection.isSettled()).toBe(true)
  })

  it('is not settled at a first report of reconnecting, and is once that ends', () => {
    const connection = renderSettled('reconnecting')
    expect(connection.isSettled()).toBe(false)

    connection.next('connected')
    expect(connection.isSettled()).toBe(true)
  })

  it('stays settled when the visitor later disconnects, and unsettled only while a connection is being made', () => {
    const connection = renderSettled('disconnected')
    connection.next('reconnecting')
    connection.next('connected')

    connection.next('disconnected')
    expect(connection.isSettled()).toBe(true)

    connection.next('connecting')
    expect(connection.isSettled()).toBe(false)

    connection.next('connected')
    expect(connection.isSettled()).toBe(true)
  })
})
