import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getConnectionCookie } from '@/lib/connection-cookie'
import { decideFeatureSwitches } from './decide-feature-switches'
import { ALL_SWITCHES_OFF } from './feature-flags'
import { getFeatureSwitches } from './get-feature-switches'

const WORKER_ENV = vi.hoisted(() => ({
  POSTHOG_PROJECT_SECRET_API_KEY: 'phs_secret_value',
}))

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    validator: (validate: (input: unknown) => unknown) => ({
      handler:
        (handler: (options: { data: unknown }) => unknown) =>
        ({ data }: { data: unknown }) =>
          handler({ data: validate(data) }),
    }),
  }),
}))

vi.mock('cloudflare:workers', () => ({ env: WORKER_ENV }))

vi.mock('@/lib/connection-cookie', () => ({
  getConnectionCookie: vi.fn(),
}))

vi.mock('./decide-feature-switches', () => ({
  decideFeatureSwitches: vi.fn(async () => ALL_SWITCHES_OFF),
}))

const COOKIE_WALLET = '0x1111111111111111111111111111111111111111'
const PASSED_WALLET = '0x2222222222222222222222222222222222222222'

describe('getFeatureSwitches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getConnectionCookie).mockReturnValue(COOKIE_WALLET)
  })

  it('decides for the wallet in the connection cookie when none is passed', async () => {
    await getFeatureSwitches({ data: {} })

    expect(decideFeatureSwitches).toHaveBeenCalledWith(
      WORKER_ENV,
      COOKIE_WALLET,
    )
  })

  it('decides for a passed wallet, or for no wallet, over the cookie', async () => {
    await getFeatureSwitches({ data: { wallet: PASSED_WALLET } })
    await getFeatureSwitches({ data: { wallet: null } })

    expect(vi.mocked(decideFeatureSwitches).mock.calls).toEqual([
      [WORKER_ENV, PASSED_WALLET],
      [WORKER_ENV, null],
    ])
  })

  it('decides a value that is not an address as no wallet', async () => {
    vi.mocked(getConnectionCookie).mockReturnValue('not-an-address')
    await getFeatureSwitches({ data: {} })
    await getFeatureSwitches({ data: { wallet: 'nick.eth' } })

    expect(vi.mocked(decideFeatureSwitches).mock.calls).toEqual([
      [WORKER_ENV, null],
      [WORKER_ENV, null],
    ])
  })

  it.each([
    [42],
    ['wallet'],
    [{ wallet: 42 }],
  ])('refuses the input %j', (data) => {
    expect(() => getFeatureSwitches({ data } as never)).toThrow(
      'Invalid feature switches input',
    )
    expect(decideFeatureSwitches).not.toHaveBeenCalled()
  })
})
