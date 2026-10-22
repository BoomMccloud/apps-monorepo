import { describe, expect, it } from 'vitest'
import { isGzip, jsonTextOf } from './postHogBody'

const JSON_TEXT = '[{"event":"ping","properties":{}}]'

describe('a body PostHog sends', () => {
  it('is gzip when it starts as gzip does', () => {
    expect(isGzip(Uint8Array.from([0x1f, 0x8b, 0x08, 0x00]))).toBe(true)
    expect(isGzip(new TextEncoder().encode(JSON_TEXT))).toBe(false)
    expect(isGzip(new Uint8Array())).toBe(false)
  })

  it('holds its JSON in a data= field, url-encoded base64', () => {
    const field = `data=${encodeURIComponent(btoa(JSON_TEXT))}`

    expect(jsonTextOf(field)).toBe(JSON_TEXT)
  })

  it('is its JSON as it is otherwise', () => {
    expect(jsonTextOf(JSON_TEXT)).toBe(JSON_TEXT)
  })

  it('throws for a data= field that is not base64', () => {
    expect(() => jsonTextOf('data=%%')).toThrow()
    expect(() => jsonTextOf('data=not*base64')).toThrow()
  })
})
