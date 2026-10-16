import { describe, expect, it, vi } from 'vitest'
import { switchRules } from './switchRules.mock'
import {
  downloadSwitchRules,
  type SwitchRulesSource,
  switchRulesUrl,
} from './switchRulesDownload'

const SOURCE: SwitchRulesSource = {
  host: 'https://posthog.example/',
  projectKey: 'phc_project',
  secretKey: 'phs_secret_value',
}

const downloadBody = () => {
  const rules = switchRules()
  return {
    flags: rules.flags,
    group_type_mapping: { '0': 'company' },
    cohorts: {},
  }
}

const answering =
  (response: Response | Error) =>
  (..._args: Parameters<typeof fetch>): Promise<Response> =>
    response instanceof Error
      ? Promise.reject(response)
      : Promise.resolve(response)

describe('downloadSwitchRules', () => {
  it('asks for the rules with the project key and the secret key, and nothing about a visitor', async () => {
    const fetchRules = vi.fn(answering(Response.json(downloadBody())))

    await downloadSwitchRules(SOURCE, { fetchRules })

    expect(fetchRules).toHaveBeenCalledOnce()
    const [url, init] = fetchRules.mock.calls[0] ?? []
    expect(url).toBe(
      'https://posthog.example/api/feature_flag/local_evaluation?token=phc_project&send_cohorts',
    )
    expect(init?.method ?? 'GET').toBe('GET')
    expect(init?.headers).toEqual({
      Authorization: 'Bearer phs_secret_value',
      'Content-Type': 'application/json',
    })
    expect(init?.body).toBeUndefined()
  })

  it('returns the rules in the shape posthog-node reads, with their ETag', async () => {
    const fetchRules = answering(
      Response.json(downloadBody(), { headers: { ETag: '"v1"' } }),
    )

    await expect(downloadSwitchRules(SOURCE, { fetchRules })).resolves.toEqual({
      status: 'downloaded',
      etag: '"v1"',
      rules: {
        flags: switchRules().flags,
        groupTypeMapping: { '0': 'company' },
        cohorts: {},
      },
    })
  })

  it('sends the ETag it holds, and reports unchanged rules on a 304', async () => {
    const fetchRules = vi.fn(answering(new Response(null, { status: 304 })))

    await expect(
      downloadSwitchRules(SOURCE, { etag: '"v1"', fetchRules }),
    ).resolves.toEqual({ status: 'unchanged' })
    expect(fetchRules.mock.calls[0]?.[1]?.headers).toMatchObject({
      'If-None-Match': '"v1"',
    })
  })

  it.each([
    [
      'a refused key',
      answering(new Response('nope', { status: 401 })),
      /answered 401/,
    ],
    [
      'an unreachable host',
      answering(new Error('connection refused')),
      /failed: connection refused/,
    ],
    [
      'a body with no rules',
      answering(Response.json({ detail: 'x' })),
      /held no rules/,
    ],
    [
      'a body that is not JSON',
      answering(new Response('<html>')),
      /held no rules/,
    ],
    [
      'rules without keys',
      answering(Response.json({ flags: [{ id: 1 }] })),
      /held no rules/,
    ],
  ])('reports %s as a failure that never names the secret key', async (_case, fetchRules, reason) => {
    const download = await downloadSwitchRules(SOURCE, { fetchRules })

    expect(download).toEqual({
      status: 'failed',
      reason: expect.stringMatching(reason),
    })
    expect(JSON.stringify(download)).not.toContain(SOURCE.secretKey)
  })

  it('builds the URL without a doubled slash', () => {
    expect(switchRulesUrl({ ...SOURCE, host: 'https://posthog.example' })).toBe(
      switchRulesUrl(SOURCE),
    )
  })
})
