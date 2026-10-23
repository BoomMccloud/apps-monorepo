import type { HcaFundingPrompt } from '@ens-apps/transaction-manager'
import type { RENEWAL_TOKEN } from '@/lib/tokens'

const USDC_UNITS_PER_CENT = 10_000n

/** The displayed USDC ceiling, derived without passing token amounts through floats. */
export const getDisplayedRenewalWalletDebit = ({
  rent,
  fee,
  balance,
}: {
  readonly rent: bigint
  readonly fee: bigint
  readonly balance: bigint
}): bigint => {
  const debit = rent + fee > balance ? rent + fee - balance : 0n
  return (
    ((debit + USDC_UNITS_PER_CENT - 1n) / USDC_UNITS_PER_CENT) *
    USDC_UNITS_PER_CENT
  )
}

/** Never reuse a USDC confirmation for another token, including an unlimited DAI permit. */
export const isRenewalFundingWithinConsent = (
  prompt: HcaFundingPrompt,
  displayedWalletDebitUsdc: bigint | undefined,
  token: RENEWAL_TOKEN,
): boolean =>
  token === 'USDC' &&
  !prompt.token &&
  displayedWalletDebitUsdc !== undefined &&
  displayedWalletDebitUsdc >= 0n &&
  prompt.permitValue <= displayedWalletDebitUsdc
