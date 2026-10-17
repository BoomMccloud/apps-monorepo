/**
 * What the analytics notice must say, each statement as the words a reader
 * would look for. The apps' unit tests and the browser walks check the notice
 * against this one table.
 */
export const NOTICE_STATEMENTS: readonly (readonly [string, RegExp])[] = [
  ['wallet addresses', /wallet address/i],
  [
    'page addresses can contain the names and wallet addresses looked up',
    /page addresses can contain the names and wallet addresses/i,
  ],
  ['page visits', /pages you visit/i],
  ['clicks and other interactions', /clicks and other interactions/i],
  ['performance timings', /performance timings/i],
  ['campaign and referrer details', /campaign and referrer details/i],
  [
    'session recordings, which show what is on the page',
    /session recordings, which show what is on the page/i,
  ],
  ['survey answers', /survey answers/i],
  ['the usage events', /usage events/i],
  ['the failed-transaction report', /failed transaction/i],
  ['the support-chat link-up', /support chat/i],
  ["the header that carries the visitor id to ENS's backend", /backend/i],
  ['which features are on', /which features are on/i],
  ['error reports', /error reports/i],
  [
    'the IP address, time zone and browser details sent with every request',
    /IP address, time zone and browser details/i,
  ],
  [
    'why it is collected',
    /to understand how the apps are used, to find problems and to improve the experience/i,
  ],
  [
    'PostHog as processor',
    /PostHog processes this data for ENS as its processor/i,
  ],
  ['how to ask for deletion', /privacy@ens\.domains/],
  ['how to ask for deletion', /delet/i],
  [
    'the choice applies across the ENS apps that share it',
    /applies to all ENS apps that share it/i,
  ],
  [
    'the shared cookies hold the choice and the visitor id',
    /kept in cookies that these apps share/i,
  ],
  [
    'the visitor id is the wallet address once a wallet is connected',
    /your visitor id is your wallet address/i,
  ],
  [
    'the ENS sites on the shared domain can read it',
    /the ENS sites on the same domain can read it/i,
  ],
  [
    'addresses and .eth names are cut from error messages, other names may remain',
    /wallet addresses and \.eth names are cut from error messages, but other names may remain/i,
  ],
]
