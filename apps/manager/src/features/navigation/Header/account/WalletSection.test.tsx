import { fireEvent, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@/utils/test-utils'
import { WalletSection } from './WalletSection'

const session = vi.hoisted(() => ({
  hasActiveSession: false,
  isEnablingSession: false,
  enableSession: vi.fn(),
  forgetLocalSession: vi.fn(),
  revokeSession: vi.fn(),
  useEoa: false,
}))

vi.mock('@/lib/smart-account', () => ({
  useSmartAccountContext: () => ({
    accountAddress: '0x1234567890123456789012345678901234567890',
    isLoading: false,
    ...session,
  }),
}))

vi.mock('@/utils/feature-flags', () => ({
  isFeatureEnabled: () => session.useEoa,
}))

vi.mock('@/utils/backend-client', () => ({ backendAuthStore: {} }))
vi.mock('@xstate/store-react', () => ({ useSelector: () => false }))
vi.mock('@/lib/wallet', () => ({
  useWalletDisconnect: () => ({
    disconnect: vi.fn(),
    isDisconnecting: false,
  }),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

describe('WalletSection device sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    session.hasActiveSession = false
    session.isEnablingSession = false
    session.useEoa = false
    session.enableSession.mockResolvedValue({ status: 'enabled' })
    session.forgetLocalSession.mockImplementation(() => {
      session.hasActiveSession = false
    })
  })

  it('turns off the local session without an on-chain revoke and offers enable next', () => {
    session.hasActiveSession = true
    const onAction = vi.fn()
    const { rerender } = render(<WalletSection onAction={onAction} />)

    expect(screen.getByText('Smart sessions on')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Enable smart sessions' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Revoke smart sessions')).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'Turn off on this device' }),
    )

    expect(session.forgetLocalSession).toHaveBeenCalledOnce()
    expect(session.revokeSession).not.toHaveBeenCalled()
    expect(session.enableSession).not.toHaveBeenCalled()
    expect(onAction).toHaveBeenCalledOnce()

    rerender(<WalletSection onAction={onAction} />)
    expect(screen.getByText('Smart sessions off')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Enable smart sessions' }),
    ).toBeEnabled()
    expect(
      screen.queryByRole('button', { name: 'Turn off on this device' }),
    ).not.toBeInTheDocument()
  })

  it('offers only enable when off and closes the menu after authorization', async () => {
    const onAction = vi.fn()
    render(<WalletSection onAction={onAction} />)

    expect(screen.getByText('Smart sessions off')).toBeInTheDocument()
    expect(
      screen.queryByText('Turn off on this device'),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Revoke smart sessions')).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'Enable smart sessions' }),
    )

    await waitFor(() => expect(onAction).toHaveBeenCalledOnce())
    expect(session.enableSession).toHaveBeenCalledOnce()
    expect(session.forgetLocalSession).not.toHaveBeenCalled()
    expect(session.revokeSession).not.toHaveBeenCalled()
  })

  it('disables enable while its signature is pending', () => {
    session.isEnablingSession = true
    render(<WalletSection onAction={vi.fn()} />)

    const button = screen.getByRole('button', {
      name: 'Enabling smart sessions…',
    })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(session.enableSession).not.toHaveBeenCalled()
  })

  it.each(['declined', 'failed'] as const)(
    'keeps the menu open when enabling is %s',
    async (status) => {
      session.enableSession.mockResolvedValue({
        status,
        message: 'Enable failed',
      })
      const onAction = vi.fn()
      render(<WalletSection onAction={onAction} />)

      fireEvent.click(
        screen.getByRole('button', { name: 'Enable smart sessions' }),
      )
      await waitFor(() => expect(session.enableSession).toHaveBeenCalledOnce())

      expect(onAction).not.toHaveBeenCalled()
      expect(screen.getByText('Smart sessions off')).toBeInTheDocument()
      if (status === 'failed') {
        expect(toast.error).toHaveBeenCalledWith('Enable failed')
      } else {
        expect(toast.error).not.toHaveBeenCalled()
      }
    },
  )

  it('hides smart-session controls in EOA mode', () => {
    session.useEoa = true
    render(<WalletSection onAction={vi.fn()} />)

    expect(screen.queryByText('Smart sessions off')).not.toBeInTheDocument()
    expect(screen.queryByText('Enable smart sessions')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Turn off on this device'),
    ).not.toBeInTheDocument()
  })
})
