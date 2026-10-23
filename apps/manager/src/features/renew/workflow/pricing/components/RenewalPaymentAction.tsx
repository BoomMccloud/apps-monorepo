import { Trans } from '@lingui/react/macro'

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
}) => {
  if (isAwaitingApproval)
    return isSigning ? (
      <Trans>Sign in wallet</Trans>
    ) : (
      <Trans>Preparing renewal...</Trans>
    )
  if (isQuoting) return <Trans>Calculating cost...</Trans>
  if (!isIntentRoute) return <Trans>Renew name</Trans>
  return hasWalletDebit ? (
    <Trans>Continue in wallet</Trans>
  ) : (
    <Trans>Sign renewal</Trans>
  )
}
