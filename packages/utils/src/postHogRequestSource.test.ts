import { describe, expect, it } from 'vitest'
import { requestSourceOf } from './postHogRequestSource'

describe('requestSourceOf', () => {
  it.each([
    [
      'a fetch or a beacon, which carry an Origin',
      { origin: 'http://app.test' },
    ],
    [
      'an image, which carries no Origin and says what it is',
      { 'sec-fetch-mode': 'no-cors', 'sec-fetch-dest': 'image' },
    ],
    [
      'a classic script, which carries no Origin and says what it is',
      { 'sec-fetch-mode': 'no-cors', 'sec-fetch-dest': 'script' },
    ],
    ['a navigation', { 'sec-fetch-mode': 'navigate' }],
  ])('takes %s for the browser, with or without a project key', (_how, headers) => {
    expect(requestSourceOf(headers, false)).toBe('browser')
    expect(requestSourceOf(headers, true)).toBe('browser')
  })

  it('takes a request that names the project and has no browser header for the server', () => {
    expect(requestSourceOf({ authorization: 'Bearer phs_key' }, true)).toBe(
      'server',
    )
    expect(requestSourceOf({}, true)).toBe('server')
  })

  it('takes a request that names no project and has no browser header for another program', () => {
    expect(requestSourceOf({ 'user-agent': 'a port prober' }, false)).toBe(
      'elsewhere',
    )
    expect(requestSourceOf({}, false)).toBe('elsewhere')
  })

  it('reads a header that is present but empty as present', () => {
    expect(requestSourceOf({ origin: '' }, false)).toBe('browser')
  })

  it('ignores a header that is undefined', () => {
    expect(
      requestSourceOf(
        { origin: undefined, 'sec-fetch-mode': undefined },
        false,
      ),
    ).toBe('elsewhere')
  })
})
