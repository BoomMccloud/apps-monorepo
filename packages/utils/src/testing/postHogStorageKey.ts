/**
 * Whether a cookie or a storage entry is PostHog's: the SDK keeps the
 * visitor's id under `ph_<key>_posthog`, and its own record of the choice
 * under `__ph_opt_in_out_<key>`. The unit tests and the browser tests use it
 * to check that the device holds nothing of PostHog's.
 */
export const isPostHogStorageKey = (key: string): boolean =>
  /^(__)?ph_/.test(key)
