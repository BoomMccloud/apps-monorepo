/** Presentation values only. Funding and consent calculations stay in token units. */
export type PaymentFundingSummary = {
  readonly registration: number
  readonly networkFee: number
  readonly total: number
  readonly hcaCredit: number
  readonly walletDebit: number
  readonly isLoading: boolean
}
