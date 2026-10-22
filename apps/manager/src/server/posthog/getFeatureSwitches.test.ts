import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getConnectionCookie } from '@/lib/connection-cookie'
import { ALL_SWITCHES_OFF } from '@/lib/posthog/feature-flags'
import { decideFeatureSwitches } from './decideFeatureSwitches'
import { getFeatureSwitches } from './getFeatureSwitches'

const WORKER_ENV = vi.hoisted(() => ({
  POSTHOG_PROJECT_SECRET_API_KEY: 'phs_secret_value',
}))

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    validator: (validate: (input: unknown) => unknown) => ({
      handler:
        (handler: (options: { readonly data: unknown }) => unknown) =>
        ({ data }: { readonly data: unknown }) =>
          handler({ data: validate(data) }),
    }),
  }),
}))

vi.mock('cloudflare:workers', () => ({ env: WORKER_ENV }))

vi.mock('@/lib/connection-cookie', () => ({
  getConnectionCookie: vi.fn(),
}))

vi.mock('./decideFeatureSwitches', () => ({
  decideFeatureSwitches: vi.fn(async () => ALL_SWITCHES_OFF),
}))

const COOKIE_WALLET = '0x1111111111111111111111111111111111111111'
const PASSED_WALLET = '0x2222222222222222222222222222222222222222'

describe('getFeatureSwitches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getConnectionCookie).mockReturnValue(COOKIE_WALLET)
  })

  it('decides for the wallet in the connection cookie when none is passed, and names it', async () => {
    await expect(getFeatureSwitches({ data: {} })).resolves.toEqual({
      wallet: COOKIE_WALLET,
      switches: ALL_SWITCHES_OFF,
    })

    expect(decideFeatureSwitches).toHaveBeenCalledWith(
      WORKER_ENV,
      COOKIE_WALLET,
    )
  })

  it('decides for a passed wallet, or for no wallet, over the cookie, and names the one it decided for', async () => {
    const passed = await getFeatureSwitches({ data: { wallet: PASSED_WALLET } })
    const none = await getFeatureSwitches({ data: { wallet: null } })

    expect(passed.wallet).toBe(PASSED_WALLET)
    expect(none.wallet).toBeNull()
    expect(vi.mocked(decideFeatureSwitches).mock.calls).toEqual([
      [WORKER_ENV, PASSED_WALLET],
      [WORKER_ENV, null],
    ])
  })

  it('decides a value that is not an address as no wallet, and names none', async () => {
    vi.mocked(getConnectionCookie).mockReturnValue('not-an-address')
    const fromCookie = await getFeatureSwitches({ data: {} })
    const fromInput = await getFeatureSwitches({ data: { wallet: 'nick.eth' } })

    expect(fromCookie.wallet).toBeNull()
    expect(fromInput.wallet).toBeNull()
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
