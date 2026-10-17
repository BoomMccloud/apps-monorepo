/** The address a `fetch` or a beacon is sent to, whichever way it was given. */
export const urlOf = (input: RequestInfo | URL): string =>
  typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.href
      : input.url
