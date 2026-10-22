/**
 * Reusable smart-session gate for any "start an HCA flow" action
 * (register, renew, …).
 *
 * On the HCA (rhinestone) path, session flows run prompt-free via a smart
 * session. Enabling that session is a PREREQUISITE for the whole flow, so this
 * gate prompts for it BEFORE the action proceeds — never mid-flow over another
 * modal. The EOA path has no session, so the action runs immediately.
 *
 * Usage:
 *   const { gate, sessionModal } = useSmartSessionGate()
 *   <Button onClick={() => gate(openTokenPicker)} />
 *   {sessionModal}
 *
 * `gate(onProceed)`: if a session is needed, opens the EnableSessionModal and
 * defers `onProceed` until the single ENABLE signature succeeds; otherwise runs
 * `onProceed` immediately.
 */

import { useCallback, useRef, useState } from 'react'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'
import { needsSessionBeforeRegistration } from '@/lib/smart-account/sessionGate'
import { EnableSessionModal } from '../components/EnableSessionModal'

export interface SmartSessionGate {
  /**
   * Run `onProceed`, gating on an active smart session first. If none is
   * active, the EnableSessionModal opens and `onProceed` runs only after the
   * ENABLE signature succeeds.
   */
  readonly gate: (onProceed: () => void) => void
  /** The wired EnableSessionModal element — render it in your tree. */
  readonly sessionModal: React.ReactNode
}

export function useSmartSessionGate(): SmartSessionGate {
  const account = useSmartAccountContext()
  const [isOpen, setIsOpen] = useState(false)
  // Only a failure during this prompt shows the error state, not one from an earlier visit.
  const [hasFailed, setHasFailed] = useState(false)
  const pendingRef = useRef<(() => void) | null>(null)

  const gate = useCallback(
    (onProceed: () => void) => {
      if (needsSessionBeforeRegistration(account)) {
        pendingRef.current = onProceed
        setHasFailed(false)
        setIsOpen(true)
        return
      }
      onProceed()
    },
    [account],
  )

  // Dismissing drops the deferred action: the next attempt starts from the user's own click.
  const dismiss = useCallback(() => {
    pendingRef.current = null
    setIsOpen(false)
  }, [])

  const onEnableSession = useCallback(async () => {
    const outcome = await account.enableSession()
    if (outcome.status === 'failed') {
      setHasFailed(true)
      return
    }
    if (outcome.status === 'declined') {
      dismiss()
      return
    }
    // The session is now active, so the downstream flow runs prompt-free off
    // `account.signer`.
    setIsOpen(false)
    const pending = pendingRef.current
    pendingRef.current = null
    pending?.()
  }, [account, dismiss])

  const sessionModal = (
    <EnableSessionModal
      hasError={hasFailed}
      isEnabling={account.isEnablingSession}
      onDismiss={dismiss}
      onEnableSession={onEnableSession}
      open={isOpen}
    />
  )

  return { gate, sessionModal }
}
