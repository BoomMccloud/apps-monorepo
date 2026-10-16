/**
 * The words of the analytics banner and notice, the same in every ENS app.
 *
 * A first draft for a lawyer to check before launch: it states in plain
 * words what the apps do, and promises nothing more. Nothing here is
 * translated.
 */

import type { AnalyticsConsent } from './analyticsConsent'

export const ANALYTICS_BANNER = {
  heading: 'Help us improve ENS',
  intro:
    'Optional analytics help ENS understand how the apps are used, find problems and improve the experience.',
  collected:
    'If you accept, PostHog processes for ENS: your wallet address when you connect one, the pages you visit (page addresses can contain names and wallet addresses), what you do in the apps, error reports, and your IP address, time zone and browser details.',
  shared:
    'Your choice applies to all ENS apps that share it, and you can change it in the privacy notice at any time.',
  accept: 'Accept Analytics',
  decline: 'Decline',
  noticeLink: 'Privacy notice',
} as const

/** The notice's own heading, which names its section on the page. */
export const ANALYTICS_NOTICE_HEADING = 'Analytics'

export const ANALYTICS_SWITCH_LABEL = 'Allow analytics'

/** The choice as the notice states it. */
export const ANALYTICS_CHOICE_STATUS: Readonly<
  Record<AnalyticsConsent, string>
> = {
  granted: 'Your choice: Accepted.',
  denied: 'Your choice: Declined.',
  pending: 'Your choice: not chosen yet.',
}

/** The paragraphs before the switch. */
export const ANALYTICS_NOTICE_INTRO = [
  'ENS uses optional analytics to understand how the apps are used, to find problems and to improve the experience.',
  'They run only if you accept, and you can change your choice here at any time. The change takes effect at once.',
] as const

export const ANALYTICS_NOTICE_COLLECTED_HEADING = 'What is collected'

export const ANALYTICS_NOTICE_COLLECTED_LEAD =
  'If you accept, the ENS Manager and the ENS Explorer send the following to PostHog:'

/** What reaches PostHog after Accept, item by item. */
export const ANALYTICS_NOTICE_COLLECTED = [
  'Your wallet address, once you connect a wallet. It then becomes your visitor id.',
  'The pages you visit. Page addresses can contain the names and wallet addresses you look up.',
  'Clicks and other interactions, including where on a page you click and clicks on parts of a page that do not respond.',
  'Performance timings of the pages you load.',
  'Campaign and referrer details: the link or site that brought you to the app.',
  'Session recordings, which show what is on the page as you use it, including any names and wallet addresses shown.',
  'Survey answers, when you answer a survey such as the Explorer’s feedback survey.',
  'Usage events: connecting and disconnecting a wallet, the names you search for and open, the steps of claiming the commemorative NFT, and the DNSSEC checks you open.',
  'In the Manager, a report of each failed transaction: the sending wallet, the addresses and data of the calls, the transaction hashes, the chain and the error.',
  'The link between the support chat and your visits: the support chat receives your visitor id and a link to your session recording.',
  'In the Manager, your visitor id, sent in a header with each request to ENS’s backend.',
  'Which features are on for you.',
  'Error reports: the error message, where the error happened, the page address, your visitor id and which features are on. Wallet addresses and .eth names are cut from error messages, but other names may remain.',
  'With every request, your IP address, time zone and browser details.',
] as const

export const ANALYTICS_NOTICE_SHARING_HEADING = 'One choice for the ENS apps'

export const ANALYTICS_NOTICE_SHARING = [
  'Your choice applies to all ENS apps that share it, today the ENS Manager and the ENS Explorer.',
  'The choice and your visitor id are kept in cookies that these apps share. Once you connect a wallet, your visitor id is your wallet address, and the ENS sites on the same domain can read it.',
] as const

export const ANALYTICS_NOTICE_PROCESSOR_HEADING = 'Who processes it'

export const ANALYTICS_NOTICE_PROCESSOR =
  'PostHog processes this data for ENS as its processor.'

export const ANALYTICS_NOTICE_DELETION_HEADING = 'Deleting your data'

export const ANALYTICS_NOTICE_DELETION_EMAIL = 'privacy@ens.domains'

/** Split around the address, which each app renders as a mail link. */
export const ANALYTICS_NOTICE_DELETION = {
  before: 'To ask for your analytics data to be deleted, email',
  after: '.',
} as const
