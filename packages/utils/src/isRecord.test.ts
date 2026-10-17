import { describe, expect, it } from 'vitest'
import { isRecord } from './isRecord'

describe('isRecord', () => {
  it.each([[{}], [{ a: 1 }], [Object.create(null)]])('accepts %j', (value) => {
    expect(isRecord(value)).toBe(true)
  })

  it.each([
    [null],
    [undefined],
    [[]],
    [[{ a: 1 }]],
    ['text'],
    [1],
    [true],
  ])('rejects %j', (value) => {
    expect(isRecord(value)).toBe(false)
  })
})
