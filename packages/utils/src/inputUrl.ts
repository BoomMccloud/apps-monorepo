/** The address a `fetch` or a beacon is sent to, whichever way it was given. */
export const urlOf = (input: RequestInfo | URL): string => {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}
