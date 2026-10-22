/** Where a request to the PostHog host came from. */
export type RequestSource = 'browser' | 'server' | 'elsewhere'

const hasHeader = (
  headers: Readonly<Record<string, string | undefined>>,
  isNamed: (name: string) => boolean,
): boolean =>
  Object.entries(headers).some(
    ([name, value]) => value !== undefined && isNamed(name),
  )

/**
 * Where a request came from, from what it carries.
 *
 * The browser: a fetch or a beacon to another origin carries an `Origin`, but
 * an image or a classic script does not, so the fetch metadata the browser
 * adds to every request (`Sec-Fetch-Mode`, `Sec-Fetch-Dest`, `Sec-Fetch-Site`)
 * counts as well. The Manager's server sends neither, and names the project
 * (its key in the path, the query or the body, or its secret key as
 * `Authorization`). Any other program on the machine, such as a tool that
 * probes each new local port, names no project and has no browser header.
 *
 * `headers` are lower-cased, as Node's HTTP server gives them.
 */
export const requestSourceOf = (
  headers: Readonly<Record<string, string | undefined>>,
  hasProjectKey: boolean,
): RequestSource => {
  if (
    hasHeader(
      headers,
      (name) => name === 'origin' || name.startsWith('sec-fetch-'),
    )
  ) {
    return 'browser'
  }
  return hasProjectKey ? 'server' : 'elsewhere'
}
