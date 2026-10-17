import type { PostHog } from 'posthog-js'
import { isRecord } from './isRecord'

/**
 * @posthog/react types its `client` with the `PostHog` of posthog-js's default
 * build, a nominally distinct declaration from the no-external build the apps
 * bundle (private fields make the two structurally incompatible), though both
 * describe the one SDK. The calls its hooks and components make on the client,
 * as @posthog/react 1.10 has them; an upgrade that calls another adds it here.
 */
const CALLS_REACT_MAKES = [
  'capture',
  'captureException',
  'getFeatureFlag',
  'getFeatureFlagResult',
  'isFeatureEnabled',
  'onFeatureFlags',
] as const

const isReactClient = (client: unknown): client is PostHog =>
  isRecord(client) &&
  CALLS_REACT_MAKES.every((call) => typeof client[call] === 'function')

/**
 * The SDK as @posthog/react's types describe it, or null when it lacks a call
 * the package makes. The page then goes without the provider, and the
 * package's hooks read the SDK it bundles itself, which is never started, so
 * every feature switch reads off.
 */
export const reactClientOf = (client: unknown): PostHog | null =>
  isReactClient(client) ? client : null
