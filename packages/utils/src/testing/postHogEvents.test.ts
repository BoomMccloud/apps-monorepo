import { describe, expect, it } from 'vitest'
import { eventsIn } from './postHogEvents'

describe('eventsIn', () => {
  it('reads a batch envelope, a bare array and one event alike', () => {
    const event = { event: 'a', properties: { x: 1 } }

    expect(eventsIn({ batch: [event] })).toEqual([event])
    expect(eventsIn([event])).toEqual([event])
    expect(eventsIn(event)).toEqual([event])
  })

  it('gives an event without properties empty ones, and drops what is not an event', () => {
    expect(
      eventsIn([{ event: 'a' }, { event: 5 }, { nope: 1 }, null, 'text']),
    ).toEqual([{ event: 'a', properties: {} }])
    expect(eventsIn('not an event')).toEqual([])
  })
})
