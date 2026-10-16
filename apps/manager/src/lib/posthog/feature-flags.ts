import type { EnsNetwork } from '@ens-apps/config'

/**
 * Every feature switch the Manager reads from PostHog. The server decides
 * each one from PostHog's rules (`decideFeatureSwitches`), the page reads the
 * answers, and the rules check fails a deploy whose rules cannot decide one;
 * a new switch needs a name here and rules in PostHog, nothing else.
 */
export const POSTHOG_FEATURE_FLAGS = {
  I18N: 'i18n',
  MIGRATION: 'migration',
  MIGRATION_NFT: 'migration-nft',
} as const

export type FeatureSwitchName =
  (typeof POSTHOG_FEATURE_FLAGS)[keyof typeof POSTHOG_FEATURE_FLAGS]

export const FEATURE_SWITCH_NAMES: readonly FeatureSwitchName[] = Object.values(
  POSTHOG_FEATURE_FLAGS,
)

/** The server's answer for every switch, for one visitor. */
export type FeatureSwitches = Readonly<Record<FeatureSwitchName, boolean>>

/**
 * The server's answers for one visitor, with the wallet they were decided
 * for: the valid address, or null for a visitor with none. Answers belong to
 * the wallet they were decided for and to no other.
 */
export type DecidedFeatureSwitches = {
  readonly wallet: string | null
  readonly switches: FeatureSwitches
}

/** What every visitor gets when the server cannot decide the switches. */
export const ALL_SWITCHES_OFF: FeatureSwitches = {
  i18n: false,
  migration: false,
  'migration-nft': false,
}

export const isMigrationNftEnabled = (params: {
  readonly network: EnsNetwork
  readonly migrationEnabled: boolean | null | undefined
  readonly migrationNftEnabled: boolean | null | undefined
}): boolean =>
  params.network === 'mainnet' &&
  params.migrationEnabled === true &&
  params.migrationNftEnabled === true
