import { describe, expect, it } from 'vitest'
import {
  ERROR_MESSAGE_MAX_LENGTH,
  scrubErrorMessage,
  scrubErrorReport,
} from './analyticsErrorReports'

// A small deterministic generator, so every run checks the same cases.
const seeded = (seed: number) => {
  let state = seed
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648
    return state / 2_147_483_648
  }
}

const pick = <T>(random: () => number, items: readonly T[]): T =>
  items[Math.floor(random() * items.length)] as T

const HEX = '0123456789abcdefABCDEF'
const hexDigits = (random: () => number, length: number): string =>
  Array.from({ length }, () => pick(random, [...HEX])).join('')

// Labels as .eth names have them, with an accent and an emoji (written as an
// escape, the fox emoji) among them.
const LABELS = [
  'vitalik',
  'nick',
  'sub.domain',
  'café',
  '\u{1F98A}fox',
  'a-b_c',
  '123',
]
const WORDS = [
  'Call',
  'failed',
  'for',
  'on:',
  'execution',
  'reverted',
  '(',
  ')',
  '"',
  '[',
  ']',
]

describe('scrubErrorMessage', () => {
  it('cuts every address and .eth name from generated messages', () => {
    const random = seeded(1741)
    for (let index = 0; index < 500; index += 1) {
      const address = `0x${hexDigits(random, 40 + Math.floor(random() * 25))}`
      const name = `${pick(random, LABELS)}.eth`
      const parts = [
        pick(random, WORDS),
        address,
        pick(random, WORDS),
        name,
        pick(random, WORDS),
      ]
      const message = parts.join(pick(random, [' ', ': ', '/', '"']))
      const scrubbed = scrubErrorMessage(message)

      expect(scrubbed).not.toContain(address)
      expect(scrubbed).not.toContain(name)
      expect(scrubbed).not.toMatch(/0x[0-9a-fA-F]{40}/)
      expect(scrubbed).not.toMatch(/\.eth\b/)
    }
  })

  it('cuts the addresses inside a longer hex run, as a failed call prints its data', () => {
    const from = '1'.repeat(40)
    const to = '2'.repeat(40)
    const padding = '0'.repeat(24)
    // transferFrom(address,address,uint256): the selector, then each argument.
    const data = `0x23b872dd${padding}${from}${padding}${to}${'0'.repeat(63)}1`

    expect(scrubErrorMessage(`Raw Call Arguments: data: ${data}`)).toBe(
      'Raw Call Arguments: data: [address]',
    )
  })

  it('leaves no run of 40 hex digits in generated messages, whatever their length', () => {
    const random = seeded(1742)
    for (let index = 0; index < 500; index += 1) {
      const run = `0x${hexDigits(random, 40 + Math.floor(random() * 400))}`
      const message = `${pick(random, WORDS)} ${run} ${pick(random, WORDS)}`

      expect(scrubErrorMessage(message)).not.toMatch(/[0-9a-fA-F]{40}/)
    }
  })

  it('keeps the rest of the message', () => {
    expect(
      scrubErrorMessage(
        'Call failed for 0x1111111111111111111111111111111111111111 on vitalik.eth: execution reverted',
      ),
    ).toBe('Call failed for [address] on [name]: execution reverted')
  })

  it('leaves names that do not end in .eth, which cannot be told from other text', () => {
    expect(scrubErrorMessage('lookup of example.com failed')).toBe(
      'lookup of example.com failed',
    )
  })

  it('does not take .ethereum for a name', () => {
    expect(scrubErrorMessage('see docs.ethereum.org')).toBe(
      'see docs.ethereum.org',
    )
  })

  it('scrubs a message holding a whole call data quickly, and cuts the data with the rest', () => {
    // A failed call's error prints its data as one long 0x token.
    const message = `Call failed for 0x1111111111111111111111111111111111111111 on vitalik.eth: data 0x${'ab'.repeat(50_000)}`
    const started = performance.now()
    const scrubbed = scrubErrorMessage(message)
    const elapsed = performance.now() - started

    expect(elapsed).toBeLessThan(500)
    expect(scrubbed).toBe('Call failed for [address] on [name]: data [address]')
  })

  it('cuts the digits of an address that the input cut went through', () => {
    // 37 digits of the address are left before the cut, too few for the pattern.
    const message = `0x${'a'.repeat(9_950)}${' '.repeat(9)}0x${'b'.repeat(40)}`
    expect(message.slice(0, 10_000).endsWith(`0x${'b'.repeat(37)}`)).toBe(true)

    expect(scrubErrorMessage(message)).toBe(
      `[address]${' '.repeat(9)}[address]`,
    )
  })

  it.each([
    ['in lower case', '8ba1f109551bd432803012645ac136ddd64dba72'],
    [
      'in mixed case, as a checksum writes it',
      '8ba1F109551bD432803012645Ac136ddd64DBA72',
    ],
    ['in upper case', '8BA1F109551BD432803012645AC136DDD64DBA72'],
    ['as a transaction hash', `${'ab12'.repeat(16)}`],
  ])('cuts an address written without 0x, %s', (_how, address) => {
    expect(scrubErrorMessage(`Call failed for ${address} on mainnet`)).toBe(
      'Call failed for [address] on mainnet',
    )
    expect(scrubErrorMessage(`/address/${address}?tab=txs`)).toBe(
      '/address/[address]?tab=txs',
    )
  })

  it('leaves a long decimal number readable, which has no hex letter to take for an address', () => {
    const maxUint256 = String(2n ** 256n - 1n)

    expect(scrubErrorMessage(`allowance ${maxUint256} is too low`)).toBe(
      `allowance ${maxUint256} is too low`,
    )
  })

  it('leaves a hex run shorter than an address, and one inside a longer word, readable', () => {
    const short = 'ab12'.repeat(9)
    const inWord = `x${'ab12'.repeat(10)}x`

    expect(scrubErrorMessage(`id ${short} and ${inWord}`)).toBe(
      `id ${short} and ${inWord}`,
    )
  })

  it('keeps a short hex value that ends a short message', () => {
    expect(scrubErrorMessage('failed with code 0x1f')).toBe(
      'failed with code 0x1f',
    )
  })

  it('cuts a long message to its maximum length, after scrubbing', () => {
    const long = `${'x'.repeat(250)} vitalik.eth`
    expect(scrubErrorMessage(long)).toHaveLength(ERROR_MESSAGE_MAX_LENGTH)
    expect(scrubErrorMessage(`0x${'a'.repeat(40)} ${'y'.repeat(300)}`)).toMatch(
      /^\[address\] y+$/,
    )
  })
})

describe('scrubErrorReport', () => {
  const report = (values: readonly unknown[]) => ({
    event: '$exception',
    properties: {
      $current_url: 'https://app.ens.domains/vitalik.eth',
      $exception_list: values.map((value) => ({
        type: 'Error',
        value,
        mechanism: { handled: false },
      })),
    },
  })

  it('scrubs every message of an error report and keeps its other properties', () => {
    const scrubbed = scrubErrorReport(
      report([
        'Call failed for 0x1111111111111111111111111111111111111111',
        'name nick.eth is taken',
      ]),
    )

    expect(scrubbed?.properties.$exception_list).toEqual([
      {
        type: 'Error',
        value: 'Call failed for [address]',
        mechanism: { handled: false },
      },
      {
        type: 'Error',
        value: 'name [name] is taken',
        mechanism: { handled: false },
      },
    ])
    // The page address is reported as it is, as the notice says.
    expect(scrubbed?.properties.$current_url).toBe(
      'https://app.ens.domains/vitalik.eth',
    )
  })

  it('passes other events through untouched', () => {
    const pageView = {
      event: '$pageview',
      properties: { $current_url: 'https://app.ens.domains/vitalik.eth' },
    }
    expect(scrubErrorReport(pageView)).toBe(pageView)
  })

  it('keeps an event it cannot read, and a dropped event dropped', () => {
    const odd = { event: '$exception', properties: { $exception_list: 'x' } }
    expect(scrubErrorReport(odd)).toBe(odd)
    expect(scrubErrorReport(null)).toBeNull()
    expect(scrubErrorReport(report([42]))?.properties.$exception_list).toEqual([
      { type: 'Error', value: 42, mechanism: { handled: false } },
    ])
  })
})
