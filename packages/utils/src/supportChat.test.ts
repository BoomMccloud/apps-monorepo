import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupportChat } from './supportChat'

const intercom = vi.hoisted(() => ({
  boot: vi.fn(),
  update: vi.fn(),
  getVisitorId: vi.fn(),
}))
vi.mock('@intercom/messenger-js-sdk', () => intercom)

const analytics = {
  get_distinct_id: () => 'visitor-id',
  get_session_replay_url: () => 'https://replay.example/session',
}
const LINK = {
  posthog_distinct_id: 'visitor-id',
  recent_replay: 'https://replay.example/session',
}

describe('createSupportChat', () => {
  const recordSupportChatVisitor = vi.fn()
  const supportChat = createSupportChat({
    appId: 'app-id',
    analytics,
    recordSupportChatVisitor,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    intercom.getVisitorId.mockReturnValue('intercom-visitor')
  })

  it.each([
    ['pending'],
    ['denied'],
    ['unknown'],
  ] as const)('boots the chat without a link to the analytics while the choice is %s', (consent) => {
    supportChat.bootSupportChat(consent)

    expect(intercom.boot).toHaveBeenCalledExactlyOnceWith({ app_id: 'app-id' })
    expect(recordSupportChatVisitor).not.toHaveBeenCalled()
  })

  it('boots the chat linked to the analytics, and records its visitor, after Accept', () => {
    supportChat.bootSupportChat('granted')

    expect(intercom.boot).toHaveBeenCalledExactlyOnceWith({
      app_id: 'app-id',
      ...LINK,
    })
    expect(recordSupportChatVisitor).toHaveBeenCalledExactlyOnceWith(
      'intercom-visitor',
    )
  })

  it('records no visitor for a chat that has none', () => {
    intercom.getVisitorId.mockReturnValue(undefined)

    supportChat.bootSupportChat('granted')

    expect(recordSupportChatVisitor).not.toHaveBeenCalled()
  })

  it('ties a chat already booted to the analytics on Accept', () => {
    supportChat.linkSupportChat()

    expect(intercom.update).toHaveBeenCalledExactlyOnceWith(LINK)
    expect(recordSupportChatVisitor).toHaveBeenCalledExactlyOnceWith(
      'intercom-visitor',
    )
  })

  it('blanks the tie to the analytics on Decline and leaves the chat running', () => {
    supportChat.unlinkSupportChat()

    expect(intercom.update).toHaveBeenCalledExactlyOnceWith({
      posthog_distinct_id: '',
      recent_replay: '',
    })
    expect(intercom.boot).not.toHaveBeenCalled()
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
