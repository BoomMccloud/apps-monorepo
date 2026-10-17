import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import posthog from 'posthog-js/dist/module.full.no-external'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ALL_SWITCHES_OFF, type FeatureSwitches } from './feature-flags'
import { getFeatureSwitches } from './getFeatureSwitches'
import {
  type FeatureSwitchSyncInput,
  useFeatureSwitchSync,
} from './useFeatureSwitchSync'

vi.mock('posthog-js/dist/module.full.no-external', () => ({
  default: { __loaded: true, updateFlags: vi.fn() },
}))
vi.mock('./getFeatureSwitches', () => ({ getFeatureSwitches: vi.fn() }))

const WALLET = '0x1111111111111111111111111111111111111111'
const OTHER_WALLET = '0x2222222222222222222222222222222222222222'
const WALLET_SWITCHES: FeatureSwitches = {
  i18n: true,
  migration: true,
  'migration-nft': false,
}
const OTHER_WALLET_SWITCHES: FeatureSwitches = {
  i18n: true,
  migration: false,
  'migration-nft': true,
}
const NO_WALLET_SWITCHES: FeatureSwitches = {
  i18n: true,
  migration: false,
  'migration-nft': false,
}

// A page the server rendered for a visitor with WALLET in the connection
// cookie, whose connection has been restored.
const BASE: FeatureSwitchSyncInput = {
  wallet: WALLET,
  isConnectionSettled: true,
  pageStart: { wallet: WALLET, switches: WALLET_SWITCHES },
  resetCount: 0,
}

const written = (switches: FeatureSwitches) =>
  [switches, undefined, { merge: false }] as const

const lastWrite = () => vi.mocked(posthog.updateFlags).mock.calls.at(-1)

/** A server answer the test settles when it chooses. */
const pendingAnswer = () => {
  const answer = Promise.withResolvers<{
    wallet: string
    switches: FeatureSwitches
  }>()
  return {
    promise: answer.promise,
    resolve: (switches: FeatureSwitches) =>
      answer.resolve({ wallet: OTHER_WALLET, switches }),
    reject: answer.reject,
  }
}

const renderSync = (input: FeatureSwitchSyncInput) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return renderHook(
    (props: FeatureSwitchSyncInput) => useFeatureSwitchSync(props),
    { initialProps: input, wrapper },
  )
}

describe('useFeatureSwitchSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('writes the answers the page started with for the wallet it started with, and asks the server for nothing', () => {
    renderSync(BASE)

    expect(posthog.updateFlags).toHaveBeenLastCalledWith(
      ...written(WALLET_SWITCHES),
    )
    expect(getFeatureSwitches).not.toHaveBeenCalled()
  })

  it('writes nothing, and asks nothing, while the connection is still being restored', () => {
    const { rerender } = renderSync({
      ...BASE,
      wallet: OTHER_WALLET,
      isConnectionSettled: false,
    })

    expect(posthog.updateFlags).not.toHaveBeenCalled()
    expect(getFeatureSwitches).not.toHaveBeenCalled()

    // Once the restored wallet is known, the server is asked for it.
    vi.mocked(getFeatureSwitches).mockReturnValue(pendingAnswer().promise)
    rerender({ ...BASE, wallet: OTHER_WALLET, isConnectionSettled: true })

    expect(getFeatureSwitches).toHaveBeenCalledWith({
      data: { wallet: OTHER_WALLET },
    })
  })

  it("writes every switch off for a wallet the page did not start with, until the server answers for it, then the server's answers", async () => {
    const answer = pendingAnswer()
    vi.mocked(getFeatureSwitches).mockReturnValue(answer.promise)

    renderSync({ ...BASE, wallet: OTHER_WALLET })

    // The page started with WALLET's answers; they are not OTHER_WALLET's.
    expect(posthog.updateFlags).toHaveBeenLastCalledWith(
      ...written(ALL_SWITCHES_OFF),
    )
    expect(posthog.updateFlags).not.toHaveBeenCalledWith(
      ...written(WALLET_SWITCHES),
    )

    await act(async () => answer.resolve(OTHER_WALLET_SWITCHES))

    await waitFor(() =>
      expect(posthog.updateFlags).toHaveBeenLastCalledWith(
        ...written(OTHER_WALLET_SWITCHES),
      ),
    )
  })

  it('writes every switch off for a visitor with no wallet when the page started with one, until the server answers', async () => {
    const answer = pendingAnswer()
    vi.mocked(getFeatureSwitches).mockReturnValue(answer.promise)

    renderSync({ ...BASE, wallet: null })

    expect(posthog.updateFlags).toHaveBeenLastCalledWith(
      ...written(ALL_SWITCHES_OFF),
    )
    expect(getFeatureSwitches).toHaveBeenCalledWith({ data: { wallet: null } })

    await act(async () => answer.resolve(NO_WALLET_SWITCHES))

    await waitFor(() =>
      expect(posthog.updateFlags).toHaveBeenLastCalledWith(
        ...written(NO_WALLET_SWITCHES),
      ),
    )
  })

  it('keeps every switch off for good when the server cannot answer', async () => {
    const answer = pendingAnswer()
    vi.mocked(getFeatureSwitches).mockReturnValue(answer.promise)
    renderSync({ ...BASE, wallet: OTHER_WALLET })

    await act(async () => answer.reject(new Error('the server is down')))

    expect(
      vi.mocked(posthog.updateFlags).mock.calls.map(([switches]) => switches),
    ).toEqual([ALL_SWITCHES_OFF])
  })

  it("gives the next wallet no switch of the last wallet's, and gives back the answers held for a wallet the visitor returns to", () => {
    vi.mocked(getFeatureSwitches).mockReturnValue(pendingAnswer().promise)
    const { rerender } = renderSync(BASE)
    vi.mocked(posthog.updateFlags).mockClear()

    rerender({ ...BASE, wallet: OTHER_WALLET })
    expect(lastWrite()).toEqual(written(ALL_SWITCHES_OFF))

    vi.mocked(posthog.updateFlags).mockClear()
    rerender(BASE)
    expect(posthog.updateFlags).toHaveBeenLastCalledWith(
      ...written(WALLET_SWITCHES),
    )
    expect(posthog.updateFlags).not.toHaveBeenCalledWith(
      ...written(ALL_SWITCHES_OFF),
    )
  })

  it('writes again after a reset, which empties the SDK without telling the page', () => {
    const { rerender } = renderSync(BASE)
    vi.mocked(posthog.updateFlags).mockClear()

    rerender({ ...BASE, resetCount: 1 })

    expect(posthog.updateFlags).toHaveBeenCalledOnce()
    expect(posthog.updateFlags).toHaveBeenLastCalledWith(
      ...written(WALLET_SWITCHES),
    )
  })

  it('after a reset, writes every switch off for a wallet whose answers are not known yet', () => {
    vi.mocked(getFeatureSwitches).mockReturnValue(pendingAnswer().promise)
    const { rerender } = renderSync({ ...BASE, wallet: OTHER_WALLET })
    vi.mocked(posthog.updateFlags).mockClear()

    rerender({ ...BASE, wallet: OTHER_WALLET, resetCount: 1 })

    expect(posthog.updateFlags).toHaveBeenLastCalledWith(
      ...written(ALL_SWITCHES_OFF),
    )
  })

  it('writes nothing for a reset that comes while the connection is still being restored', () => {
    const { rerender } = renderSync({ ...BASE, isConnectionSettled: false })

    rerender({ ...BASE, isConnectionSettled: false, resetCount: 1 })

    expect(posthog.updateFlags).not.toHaveBeenCalled()
  })
})
