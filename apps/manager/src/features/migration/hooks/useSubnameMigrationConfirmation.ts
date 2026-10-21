import { useEffect, useRef, useState } from 'react'
import type { SubnameMigrationImpactState } from './useSubnameMigrationImpact'

type Action = 'start' | 'retry'

const focusedElement = () =>
  document.activeElement instanceof HTMLElement ? document.activeElement : null

export const useSubnameMigrationConfirmation = ({
  impact,
  onConfirm,
}: {
  readonly impact: SubnameMigrationImpactState
  readonly onConfirm: (action: Action) => boolean | Promise<boolean>
}) => {
  const [action, setAction] = useState<Action | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const requestRevision = useRef(0)
  const busy = useRef(false)
  const invokingElement = useRef<HTMLElement | null>(null)
  const reviewKey = impact.canReview ? impact.selectionKey : null
  const selection = useRef(reviewKey)

  const cancel = () => {
    requestRevision.current += 1
    setAction(null)
  }

  useEffect(() => {
    // Never carry an open decision across selections or execution contexts.
    if (reviewKey === null || selection.current !== reviewKey) {
      requestRevision.current += 1
      setAction(null)
    }
    selection.current = reviewKey
  }, [reviewKey])

  useEffect(
    () => () => {
      requestRevision.current += 1
    },
    [],
  )

  const isCurrentRequest = (revision: number, selectionKey: string) =>
    requestRevision.current === revision && selection.current === selectionKey

  const request = async (requestedAction: Action): Promise<boolean> => {
    if (busy.current || !impact.canReview) return false
    invokingElement.current = focusedElement()
    const revision = ++requestRevision.current
    const selectionKey = impact.selectionKey
    if (impact.status === 'ready' && impact.impact?.affectedCount === 0) {
      busy.current = true
      setIsChecking(true)
      try {
        const safe = await impact.checkBeforeStart()
        if (!isCurrentRequest(revision, selectionKey)) return false
        if (safe) return await onConfirm(requestedAction)
      } finally {
        busy.current = false
        setIsChecking(false)
      }
    }
    if (!isCurrentRequest(revision, selectionKey)) return false
    setAction(requestedAction)
    impact.retry()
    return false
  }

  const confirm = async () => {
    if (busy.current || action === null || impact.status !== 'ready') return
    const revision = requestRevision.current
    busy.current = true
    setIsChecking(true)
    try {
      const safe = await impact.checkBeforeStart(impact.impact?.fingerprint)
      if (!safe || requestRevision.current !== revision) return
      // Continue is the acknowledgement, bound to the identities just shown.
      // If the final read changes them, keep the dialog open for review again.
      if (await onConfirm(action)) setAction(null)
    } finally {
      busy.current = false
      setIsChecking(false)
    }
  }

  return {
    open: action !== null,
    isChecking,
    request,
    confirm,
    cancel,
    restoreFocus: () => invokingElement.current?.focus(),
  }
}
