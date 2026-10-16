import type { SwitchRules } from './switchRules'

/**
 * The last good switch rules, in the Worker's KV space. The scheduled refresh
 * writes them once they pass the rules check; requests only read them. The
 * space holds PostHog's rules, which can name wallets ENS chose, and nothing
 * from visitors.
 */
export const SWITCH_RULES_KEY = 'switch-rules'

export type StoredSwitchRules = {
  readonly rules: SwitchRules
  readonly etag: string | null
  readonly storedAt: string
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isStoredRules = (value: unknown): value is StoredSwitchRules =>
  isRecord(value) &&
  isRecord(value.rules) &&
  Array.isArray(value.rules.flags) &&
  isRecord(value.rules.groupTypeMapping) &&
  isRecord(value.rules.cohorts) &&
  (value.etag === null || typeof value.etag === 'string') &&
  typeof value.storedAt === 'string'

/** The stored rules, or null when none are stored or they cannot be read. */
export const readStoredRules = async (
  space: KVNamespace,
): Promise<StoredSwitchRules | null> => {
  const value: unknown = await space.get(SWITCH_RULES_KEY, 'json')
  return isStoredRules(value) ? value : null
}

export const writeStoredRules = (
  space: KVNamespace,
  stored: StoredSwitchRules,
): Promise<void> => space.put(SWITCH_RULES_KEY, JSON.stringify(stored))
