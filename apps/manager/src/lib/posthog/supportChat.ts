import { createSupportChat } from '@ens-apps/utils/supportChat'
import { INTERCOM_APP_ID } from '@/lib/intercom'
import posthog from './client'
import { trackWithOptions } from './events'

export const {
  bootSupportChat,
  linkSupportChat,
  relinkSupportChat,
  unlinkSupportChat,
} = createSupportChat({
  appId: INTERCOM_APP_ID,
  analytics: posthog,
  recordSupportChatVisitor: (intercomVisitorId) =>
    trackWithOptions('intercom:booted', undefined, {
      $set: { intercom_visitor_id: intercomVisitorId },
    }),
})
