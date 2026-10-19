/**
 * What an error report may carry out of the page. The SDK's `before_send`
 * (`scrubErrorReport`) cuts addresses and `.eth` names out of the messages of
 * an error report before it is sent, and cuts each message to length. It works
 * on the report alone and knows nothing of the visitor's choice, which
 * `analyticsConsent` holds.
 */
import { isRecord } from './isRecord'

// An address, a hash, or a failed call's whole data, which holds addresses
// inside it: `0x` and 40 or more hex digits, of any length, or the same
// digits with no `0x`, as a run of its own (not inside a longer word) that
// holds a hex letter, so that a long decimal number stays readable.
const ADDRESS_PATTERN =
  /0x[0-9a-fA-F]{40,}|\b(?=\d*[a-fA-F])[0-9a-fA-F]{40,}\b/g
// A run of anything but spaces, quotes and brackets that ends in `.eth`, no
// longer than a name can be (253 characters), so a long run with no `.eth`,
// such as a call's whole data, is not searched again from every character.
const ETH_NAME_PATTERN = /[^\s"'`<>()[\]{},;:]{1,253}\.eth\b/giu
export const ERROR_MESSAGE_MAX_LENGTH = 200
// More than enough for any 200 characters left after scrubbing, since each
// address or name cut shrinks the text, and short enough to scrub at once on
// the page's thread.
const SCRUBBED_INPUT_MAX_LENGTH = 10_000

// The hex digits of an address the cut went through: with fewer than 40 left
// they are no address to the pattern above, so they are cut with the rest.
const CUT_ADDRESS_PATTERN = /0x[0-9a-fA-F]*$/u

const cutToScrubbedInput = (message: string): string =>
  message.length > SCRUBBED_INPUT_MAX_LENGTH
    ? message
        .slice(0, SCRUBBED_INPUT_MAX_LENGTH)
        .replace(CUT_ADDRESS_PATTERN, '[address]')
    : message

/**
 * Cut addresses and `.eth` names out of an error message, then cut it to
 * length. A name that does not end in `.eth` cannot be told from other text,
 * so other names may remain.
 */
export const scrubErrorMessage = (message: string): string =>
  cutToScrubbedInput(message)
    .replace(ADDRESS_PATTERN, '[address]')
    .replace(ETH_NAME_PATTERN, '[name]')
    .slice(0, ERROR_MESSAGE_MAX_LENGTH)

const scrubExceptionEntry = (entry: unknown): unknown =>
  isRecord(entry) && typeof entry.value === 'string'
    ? { ...entry, value: scrubErrorMessage(entry.value) }
    : entry

/**
 * The SDK's `before_send`: an error report's messages lose their addresses
 * and `.eth` names; every other event passes through unchanged.
 */
export const scrubErrorReport = <
  TEvent extends {
    readonly event: string
    readonly properties: Readonly<Record<string, unknown>>
  },
>(
  event: TEvent | null,
): TEvent | null => {
  if (event?.event !== '$exception') return event
  const list = event.properties.$exception_list
  if (!Array.isArray(list)) return event
  return {
    ...event,
    properties: {
      ...event.properties,
      $exception_list: list.map(scrubExceptionEntry),
    },
  }
}
