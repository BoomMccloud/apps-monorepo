import type { FailedRunPayloadV2 } from '@ens-apps/transaction-manager'
import posthog from '@ens-apps/utils/postHogClient'
import {
  createTracker,
  type SharedPostHogEvents,
} from '@ens-apps/utils/postHogTrack'

export type PostHogEvents = SharedPostHogEvents & {
  'nft:completion_check': {
    outcome: 'complete' | 'incomplete' | 'reconciling' | 'error' | 'aborted'
    duration_ms: number
    remaining_count?: number
  }
  'nft:claim_outcome': {
    outcome:
      | 'submitted'
      | 'minted'
      | 'cancelled'
      | 'replaced'
      | 'reverted'
      | 'pending'
      | 'error'
  }
  'nft:renderer_fallback': {
    reason: 'renderer_failed' | 'renderer_timeout' | 'reduced_motion'
  }
  'nft:download_failure': {
    reason: 'network' | 'http' | 'timeout' | 'aborted' | 'unknown'
  }
  'name:search_selected': {
    name: string
    source: 'header_search'
  }

  'tm:failed_run': {
    tm_payload: FailedRunPayloadV2
    tm_run_id: string
    tm_tx_id: string
    tm_status: 'error' | 'cancelled'
    tm_failure_stage: string
    tm_state_final: string
    tm_chain_id?: number
    tm_intent_type?: string
    tm_request_type?: string
    tm_signer_type?: string
    tm_error_name?: string
    tm_error_cause_name?: string
    tm_hash?: string
    tm_userop_hash?: string
    tm_retry_count: number
    tm_event_count: number
    tm_truncated: boolean
    tm_dropped_events: number
    source_app: 'manager'
    build_env: string
  }
}

export const { track, trackWithOptions } = createTracker<PostHogEvents>(posthog)
