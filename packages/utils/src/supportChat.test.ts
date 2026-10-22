import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnalyticsConsent } from './analyticsConsent'
import { createSupportChat } from './supportChat'

const intercom = vi.hoisted(() => ({
  boot: vi.fn(),
  update: vi.fn(),
  getVisitorId: vi.fn(),
}))
vi.mock('@intercom/messenger-js-sdk', () => intercom)

const consent = vi.hoisted(() => ({
  status: vi.fn<() => AnalyticsConsent>(),
}))
const analytics = {
  get_distinct_id: vi.fn(() => 'visitor-id'),
  get_session_replay_url: () => 'https://replay.example/session',
  get_explicit_consent_status: () => consent.status(),
  capture: vi.fn(),
}
const LINK = {
  posthog_distinct_id: 'visitor-id',
  recent_replay: 'https://replay.example/session',
}
// What the chat records against the visitor's analytics once its widget has a
// visitor of its own.
const RECORDED = [
  'intercom:booted',
  undefined,
  { $set: { intercom_visitor_id: 'intercom-visitor' } },
] as const

describe('createSupportChat', () => {
  // A new chat for each test: it remembers the visitors it has recorded.
  let supportChat: ReturnType<typeof createSupportChat>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    consent.status.mockReturnValue('granted')
    analytics.get_distinct_id.mockReturnValue('visitor-id')
    intercom.getVisitorId.mockReturnValue('intercom-visitor')
    supportChat = createSupportChat({ appId: 'app-id', analytics })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    ['pending'],
    ['denied'],
    ['unknown'],
  ] as const)('boots the chat without a link to the analytics while the choice is %s', (choice) => {
    supportChat.bootSupportChat(choice)

    expect(intercom.boot).toHaveBeenCalledExactlyOnceWith({ app_id: 'app-id' })
    expect(analytics.capture).not.toHaveBeenCalled()
  })

  it('boots the chat linked to the analytics, and records its visitor, after Accept', () => {
    supportChat.bootSupportChat('granted')

    expect(intercom.boot).toHaveBeenCalledExactlyOnceWith({
      app_id: 'app-id',
      ...LINK,
    })
    expect(analytics.capture).toHaveBeenCalledExactlyOnceWith(...RECORDED)
  })

  it("asks again for the chat's visitor until its widget has one, then records it once", async () => {
    intercom.getVisitorId
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(undefined)
      .mockReturnValue('intercom-visitor')

    supportChat.bootSupportChat('granted')
    expect(analytics.capture).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(10_000)

    expect(analytics.capture).toHaveBeenCalledExactlyOnceWith(...RECORDED)
    expect(intercom.getVisitorId).toHaveBeenCalledTimes(3)
  })

  it.each([
    ['denied'],
    ['pending'],
  ] as const)('stops asking once the choice is %s', async (choice) => {
    intercom.getVisitorId.mockReturnValue(undefined)
    supportChat.bootSupportChat('granted')
    consent.status.mockReturnValue(choice)

    await vi.advanceTimersByTimeAsync(60_000)

    expect(analytics.capture).not.toHaveBeenCalled()
    expect(intercom.getVisitorId).toHaveBeenCalledTimes(1)
  })

  it('gives up on a chat that never has a visitor', async () => {
    intercom.getVisitorId.mockReturnValue(undefined)
    supportChat.bootSupportChat('granted')

    await vi.advanceTimersByTimeAsync(120_000)

    expect(analytics.capture).not.toHaveBeenCalled()
    // The first ask, and thirty more.
    expect(intercom.getVisitorId).toHaveBeenCalledTimes(31)
  })

  it('records one chat visitor once when a boot and a link both ask', () => {
    supportChat.bootSupportChat('granted')
    supportChat.linkSupportChat()

    expect(analytics.capture).toHaveBeenCalledExactlyOnceWith(...RECORDED)
  })

  it("records the chat's visitor again for a new visitor id of the analytics", () => {
    supportChat.bootSupportChat('granted')
    analytics.get_distinct_id.mockReturnValue('wallet-visitor')

    supportChat.relinkSupportChat()

    expect(analytics.capture).toHaveBeenCalledTimes(2)
    expect(analytics.capture).toHaveBeenLastCalledWith(...RECORDED)
  })

  it('ties a chat already booted to the analytics on Accept', () => {
    supportChat.linkSupportChat()

    expect(intercom.update).toHaveBeenCalledExactlyOnceWith(LINK)
    expect(analytics.capture).toHaveBeenCalledExactlyOnceWith(...RECORDED)
  })

  it("ties the chat to the visitor's new id after the id changed, while the visitor has accepted", () => {
    supportChat.relinkSupportChat()

    expect(intercom.update).toHaveBeenCalledExactlyOnceWith(LINK)
  })

  it.each([
    ['denied'],
    ['pending'],
  ] as const)('ties the chat to nothing after the id changed while the choice is %s', (choice) => {
    consent.status.mockReturnValue(choice)

    supportChat.relinkSupportChat()

    expect(intercom.update).not.toHaveBeenCalled()
  })

  it('blanks the tie to the analytics on Decline and leaves the chat running', () => {
    supportChat.unlinkSupportChat()

    expect(intercom.update).toHaveBeenCalledExactlyOnceWith({
      posthog_distinct_id: '',
      recent_replay: '',
    })
    expect(intercom.boot).not.toHaveBeenCalled()
  })

  it("never lets a failing ask for the chat's visitor crash the app", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    intercom.getVisitorId
      .mockReturnValueOnce(undefined)
      .mockImplementation(() => {
        throw new Error('widget gone')
      })
    supportChat.bootSupportChat('granted')

    await vi.advanceTimersByTimeAsync(2_000)

    expect(warn).toHaveBeenCalledWith(
      '[intercom] link failed',
      expect.any(Error),
    )
    expect(analytics.capture).not.toHaveBeenCalled()
  })

  it('never lets a failing chat crash the app', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    intercom.boot.mockImplementation(() => {
      throw new Error('blocked domain')
    })
    intercom.update.mockImplementation(() => {
      throw new Error('not booted')
    })

    expect(() => supportChat.bootSupportChat('granted')).not.toThrow()
    expect(() => supportChat.linkSupportChat()).not.toThrow()
    expect(() => supportChat.unlinkSupportChat()).not.toThrow()
    expect(warn).toHaveBeenCalledTimes(3)
  })
})
