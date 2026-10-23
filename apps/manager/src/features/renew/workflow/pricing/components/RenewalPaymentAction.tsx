import { Trans } from '@lingui/react/macro'
import { match } from 'ts-pattern'

/** The ready CTA describes a wallet handoff without assuming an extra permit is needed. */
export const RenewalPaymentAction = ({
  isAwaitingApproval,
  isSigning,
  isQuoting,
  isIntentRoute,
  hasWalletDebit,
}: {
  readonly isAwaitingApproval: boolean
  readonly isSigning: boolean
  readonly isQuoting: boolean
  readonly isIntentRoute: boolean
  readonly hasWalletDebit: boolean
}) =>
  match({
    isAwaitingApproval,
    isSigning,
    isQuoting,
    isIntentRoute,
    hasWalletDebit,
  })
    .with({ isAwaitingApproval: true, isSigning: true }, () => (
      <Trans>Sign in wallet</Trans>
    ))
    .with({ isAwaitingApproval: true }, () => (
      <Trans>Preparing renewal...</Trans>
    ))
    .with({ isQuoting: true }, () => <Trans>Calculating cost...</Trans>)
    .with({ isIntentRoute: false }, () => <Trans>Renew name</Trans>)
    .with({ hasWalletDebit: true }, () => <Trans>Continue in wallet</Trans>)
    .otherwise(() => <Trans>Sign renewal</Trans>)
