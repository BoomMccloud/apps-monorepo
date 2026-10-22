// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetLegacyProjects } from './analyticsLegacyStorage'
import {
  clearCookies,
  cookieValue,
  writeCookie,
} from './testing/postHogTestKit'

const OLD = 'phc_old_project_key'
const CURRENT = 'phc_current_project_key'
const VISITOR = JSON.stringify({ distinct_id: '0xvisitor' })

const entriesOf = (projectKey: string) => [
  `ph_${projectKey}_posthog`,
  `ph_${projectKey}_window_id`,
  `ph_${projectKey}_primary_window_exists`,
  `__ph_opt_in_out_${projectKey}`,
]

const seed = (projectKey: string, cookieAttributes = 'path=/') => {
  for (const name of entriesOf(projectKey)) {
    localStorage.setItem(name, VISITOR)
    sessionStorage.setItem(name, VISITOR)
    writeCookie(name, encodeURIComponent(VISITOR), cookieAttributes)
  }
}

/** The entries of a project still on the device; a cookie with no value is gone. */
const present = (projectKey: string) =>
  entriesOf(projectKey).filter(
    (name) =>
      localStorage.getItem(name) !== null ||
      sessionStorage.getItem(name) !== null ||
      Boolean(cookieValue(name)),
  )

const setUrl = (url: string): void => {
  const { happyDOM } = window as unknown as {
    readonly happyDOM: { readonly setURL: (url: string) => void }
  }
  happyDOM.setURL(url)
}

describe('forgetLegacyProjects', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    clearCookies()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    setUrl('http://localhost:3000/')
  })

  it('removes every entry of a project the app has left, from local storage, session storage and cookies', () => {
    seed(OLD)
    expect(present(OLD)).toEqual(entriesOf(OLD))

    forgetLegacyProjects([OLD])

    expect(present(OLD)).toEqual([])
  })

  it('leaves the entries of every other project alone, the current one included', () => {
    seed(OLD)
    seed(CURRENT)

    forgetLegacyProjects([OLD])

    expect(present(CURRENT)).toEqual(entriesOf(CURRENT))
  })

  it('removes the cookies the SDK shares across subdomains', () => {
    setUrl('https://explorer.ens.test/')
    seed(OLD, 'path=/; domain=ens.test')
    expect(present(OLD)).toEqual(entriesOf(OLD))

    forgetLegacyProjects([OLD])

    expect(present(OLD)).toEqual([])
  })

  it('does nothing without a legacy project', () => {
    seed(CURRENT)

    forgetLegacyProjects([])

    expect(present(CURRENT)).toEqual(entriesOf(CURRENT))
  })

  it('never lets storage the browser refuses stop the app', () => {
    vi.spyOn(Storage.prototype, 'key').mockImplementation(() => {
      throw new Error('storage is blocked')
    })

    expect(() => forgetLegacyProjects([OLD])).not.toThrow()
  })
})
