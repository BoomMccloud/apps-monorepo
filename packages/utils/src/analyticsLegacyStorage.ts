/**
 * An app that moved to another PostHog project leaves the old project's
 * entries on a returning visitor's device: the SDK keeps the visitor id (a
 * wallet address, once the visitor connected one) and the tab's window id in
 * storage and cookies under the project's key, and clears only the current
 * project's. Nothing reads the old entries any more, so they go: a visitor
 * who has not accepted, or has declined, has no PostHog identifier on their
 * device.
 */

/**
 * The PostHog project the Explorer used before it joined the Manager's (the
 * ticket's one-project decision). A returning visitor's browser still holds
 * that project's visitor id, which is a wallet address once they connected
 * one, and the SDK clears only the current project's. The entries sit in
 * storage and in cookies the Explorer shared with its parent domain, so both
 * apps clear them at start-up.
 */
export const LEGACY_POSTHOG_PROJECT_KEYS = [
  'phc_1Md3nkBli5dtiu6CE9ERfaCYye84aE8PUhQNBjNdzCh',
] as const

/** The names the SDK writes for a project: its persistence, window and consent entries. */
const belongsTo =
  (projectKey: string) =>
  (name: string): boolean =>
    name.startsWith(`ph_${projectKey}_`) ||
    name === `__ph_opt_in_out_${projectKey}`

const namesIn = (storage: Storage): readonly string[] =>
  Array.from({ length: storage.length }, (_, index) => storage.key(index) ?? '')

const forgetFromStorage = (
  storage: Storage,
  owns: (name: string) => boolean,
): void => {
  for (const name of namesIn(storage).filter(owns)) storage.removeItem(name)
}

const cookieNames = (): readonly string[] =>
  document.cookie.split(';').map((cookie) => cookie.split('=')[0]?.trim() ?? '')

/** The host and each parent domain the SDK may have shared a cookie with: `a.b.c` gives `a.b.c` and `b.c`. */
const cookieDomains = (hostname: string): readonly string[] => {
  const labels = hostname.split('.')
  return labels.slice(0, -1).map((_, index) => labels.slice(index).join('.'))
}

const expireCookie = (name: string): void => {
  for (const domain of [undefined, ...cookieDomains(location.hostname)]) {
    // biome-ignore lint/suspicious/noDocumentCookie: A cookie the SDK shared with a parent domain is expired only by assigning it again with that domain, and the Cookie Store API is newer than the browsers the repository supports.
    document.cookie = `${name}=; Max-Age=0; Path=/${domain ? `; Domain=${domain}` : ''}`
  }
}

/**
 * Remove every entry the SDK wrote for each of the given project keys. Storage
 * the browser refuses to open holds nothing to remove, and never stops the app.
 */
export const forgetLegacyProjects = (projectKeys: readonly string[]): void => {
  for (const projectKey of projectKeys) {
    const owns = belongsTo(projectKey)
    for (const storage of [() => localStorage, () => sessionStorage]) {
      try {
        forgetFromStorage(storage(), owns)
      } catch {
        // Storage the browser refuses to open holds nothing to forget.
      }
    }
    try {
      for (const name of cookieNames().filter(owns)) expireCookie(name)
    } catch {
      // Cookies the browser refuses hold nothing to forget either.
    }
  }
}
