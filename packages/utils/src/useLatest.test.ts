// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useLatest } from './useLatest'

describe('useLatest', () => {
  it('hands back the same ref on every render, holding the latest value', () => {
    const { result, rerender } = renderHook(({ value }) => useLatest(value), {
      initialProps: { value: 'first' },
    })
    const first = result.current

    rerender({ value: 'second' })

    expect(result.current).toBe(first)
    expect(result.current.current).toBe('second')
  })
})
