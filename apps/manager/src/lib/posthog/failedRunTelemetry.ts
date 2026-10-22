import { transactionManager } from '@ens-apps/transaction-manager'
import { useEffect } from 'react'
import { track } from './events'

/**
 * Report every failed transaction run: to the console on a development
 * build, and to PostHog as `tm:failed_run`, which the SDK sends only after
 * Accept. On a development build it also logs every run event to the
 * console. Returns the function that removes both subscriptions.
 */
const subscribeFailedRunTelemetry = (): (() => void) => {
  const unsubscribeFailed = transactionManager.onFailedRunTelemetry(
    (payload) => {
      if (import.meta.env.DEV) {
        console.groupCollapsed(
          `[TM-RUN] failed ${payload.run.txId} status=${payload.run.status} stage=${payload.summary.failureStage}`,
        )
        console.info('summary', {
          runId: payload.run.runId,
          txId: payload.run.txId,
          status: payload.run.status,
          failureStage: payload.summary.failureStage,
          finalErrorName: payload.summary.finalErrorName,
          finalCauseName: payload.summary.finalError?.cause?.name,
          hash: payload.summary.hash,
          userOpHash: payload.summary.userOpHash,
          requestType: payload.summary.requestType,
        })
        console.groupEnd()
      }

      try {
        track('tm:failed_run', {
          tm_payload: payload,
          tm_run_id: payload.run.runId,
          tm_tx_id: payload.run.txId,
          tm_status: payload.run.status,
          tm_failure_stage: payload.summary.failureStage,
          tm_state_final: payload.summary.finalState,
          tm_chain_id: payload.summary.chainId,
          tm_intent_type: payload.summary.intentType,
          tm_request_type: payload.summary.requestType,
          tm_signer_type: payload.summary.signerType,
          tm_error_name: payload.summary.finalErrorName,
          tm_error_cause_name: payload.summary.finalError?.cause?.name,
          tm_hash: payload.summary.hash,
          tm_userop_hash: payload.summary.userOpHash,
          tm_retry_count: payload.summary.attemptCount,
          tm_event_count: payload.truncation.totalEvents,
          tm_truncated: payload.truncation.truncated,
          tm_dropped_events: payload.truncation.droppedEvents,
          source_app: 'manager',
          build_env: import.meta.env.MODE,
        })
      } catch (error) {
        console.warn('Failed to capture tm:failed_run telemetry', error)
      }
    },
  )

  const unsubscribeLive = import.meta.env.DEV
    ? transactionManager.onRunTelemetryEvent(({ txId, event }) => {
        try {
          const phase = event.substate
            ? `${event.phase}.${event.substate}`
            : event.phase
          console.debug(
            `[TM-RUN] ${txId} #${event.sequence} ${phase} reason=${event.reason} retry=${event.retryCount} hash=${event.hash || 'n/a'}`,
          )
        } catch (error) {
          console.warn('Failed to log tm run telemetry event', error)
        }
      })
    : () => {}

  return () => {
    unsubscribeFailed()
    unsubscribeLive()
  }
}

/** Once the page has hydrated: report failed transaction runs until unmount. */
export const useFailedRunTelemetry = (isHydrated: boolean): void => {
  useEffect(() => {
    if (!isHydrated) return
    return subscribeFailedRunTelemetry()
  }, [isHydrated])
}
