import { createSupportChat } from '@ens-apps/utils/supportChat'
import posthog from 'posthog-js/dist/module.full.no-external'
import { INTERCOM_APP_ID } from '@/lib/intercom'
import { trackWithOptions } from './events'

export const { bootSupportChat, linkSupportChat } = createSupportChat({
  appId: INTERCOM_APP_ID,
  analytics: posthog,
  recordSupportChatVisitor: (intercomVisitorId) =>
    trackWithOptions('intercom:booted', undefined, {
      $set: { intercom_visitor_id: intercomVisitorId },
    }),
})
