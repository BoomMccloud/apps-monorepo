import { ContractFunctionRevertedError } from 'viem'

/**
 * Whether the call came back FROM the contract rather than failing to reach it.
 *
 * Matched on viem's revert error names as well as the class, since class
 * identity does not survive the production build. Deliberately not on a numeric
 * `code`: that would read any unrelated `code: 3` in the chain as a revert, so a
 * transport failure would pass for the contract's answer.
 */
const REVERT_ERROR_NAMES: ReadonlySet<string> = new Set([
  'ContractFunctionRevertedError',
  'ExecutionRevertedError',
])

export const isContractRevert = (error: unknown): boolean => {
  let current: unknown = error
  for (let depth = 0; depth < 10 && current != null; depth += 1) {
    if (current instanceof ContractFunctionRevertedError) return true
    const { name } = current as { name?: unknown }
    if (typeof name === 'string' && REVERT_ERROR_NAMES.has(name)) return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}
