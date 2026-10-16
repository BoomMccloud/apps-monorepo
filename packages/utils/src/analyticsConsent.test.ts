import { describe, expect, it } from 'vitest'
import {
  COLLECTION_OFF,
  collectionOn,
  ERROR_MESSAGE_MAX_LENGTH,
  scrubErrorMessage,
  scrubErrorReport,
} from './analyticsConsent'

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

const LABELS = [
  'vitalik',
  'nick',
  'sub.domain',
  'café',
  '🦊fox',
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

describe('collection settings', () => {
  it('switch the same settings off and on', () => {
    expect(Object.keys(collectionOn({ isDev: false })).sort()).toEqual(
      Object.keys(COLLECTION_OFF).sort(),
    )
  })

  it('collect nothing before Accept', () => {
    expect(COLLECTION_OFF).toMatchObject({
      capture_pageview: false,
      capture_pageleave: false,
      autocapture: false,
      capture_exceptions: false,
      disable_session_recording: true,
      disable_surveys: true,
    })
  })

  it('keep recordings off on a development build, as before the pause', () => {
    expect(collectionOn({ isDev: true }).disable_session_recording).toBe(true)
    expect(collectionOn({ isDev: false }).disable_session_recording).toBe(false)
  })
})
