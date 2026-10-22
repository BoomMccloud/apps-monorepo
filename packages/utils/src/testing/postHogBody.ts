/**
 * The encodings of a body PostHog's SDK sends, as the two fakes of PostHog's
 * host read them: gzip bytes, `data=<url-encoded base64 of the JSON>`, or
 * plain JSON. Each fake gunzips with its own runtime's tools (a stream in the
 * unit tests, zlib in the browser tests' stand-in) and decides for itself what
 * a body that does not decode means.
 */

const GZIP_MAGIC_BYTES = [0x1f, 0x8b] as const

/** Whether the bytes start as gzip does. */
export const isGzip = (bytes: Uint8Array): boolean =>
  GZIP_MAGIC_BYTES.every((byte, index) => bytes[index] === byte)

const FORM_FIELD = 'data='

const fromBase64 = (text: string): string =>
  new TextDecoder().decode(
    Uint8Array.from(atob(text), (char) => char.charCodeAt(0)),
  )

/**
 * The JSON text of a body that is not gzip: its `data=` field decoded, or the
 * text as it is. A `data=` field that is not url-encoded base64 throws, as
 * `decodeURIComponent` and `atob` do.
 */
export const jsonTextOf = (text: string): string =>
  text.startsWith(FORM_FIELD)
    ? fromBase64(decodeURIComponent(text.slice(FORM_FIELD.length)))
    : text
