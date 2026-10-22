import posthog from '@ens-apps/utils/postHogClient'
import { createSupportChat } from '@ens-apps/utils/supportChat'
import { INTERCOM_APP_ID } from '@/lib/intercom'

export const {
  bootSupportChat,
  linkSupportChat,
  relinkSupportChat,
  unlinkSupportChat,
} = createSupportChat({ appId: INTERCOM_APP_ID, analytics: posthog })
