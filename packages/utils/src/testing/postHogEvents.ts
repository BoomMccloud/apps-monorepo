import { isRecord } from '../isRecord'

/** One event as the SDK sends it. */
export type SentEvent = {
  readonly event: string
  readonly properties: Readonly<Record<string, unknown>>
}

const toEvent = (value: unknown): SentEvent | null =>
  isRecord(value) && typeof value.event === 'string'
    ? {
        event: value.event,
        properties: isRecord(value.properties) ? value.properties : {},
      }
    : null

const itemsIn = (body: unknown): readonly unknown[] => {
  if (Array.isArray(body)) return body
  if (isRecord(body) && Array.isArray(body.batch)) return body.batch
  return [body]
}

/**
 * The events a decoded request body carries: a batch envelope, a bare array
 * or one event. Anything else in the body is not an event.
 */
export const eventsIn = (body: unknown): readonly SentEvent[] =>
  itemsIn(body).flatMap((item) => {
    const event = toEvent(item)
    return event ? [event] : []
  })
