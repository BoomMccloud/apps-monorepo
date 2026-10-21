import { Plural, Trans } from '@lingui/react/macro'
import { CircleAlert, LoaderCircle } from 'lucide-react'
import { type ReactNode, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { EXPLORER_URL } from '@/constants'
import type { SubnameMigrationImpactState } from '../hooks/useSubnameMigrationImpact'

const linkClassName =
  'rounded-sm font-medium text-ens-garnet-900 underline decoration-ens-garnet-900/30 underline-offset-4 hover:decoration-ens-garnet-900 focus-visible:outline-2 focus-visible:outline-offset-2'

const ExplorerLink = ({ children }: { readonly children: ReactNode }) =>
  EXPLORER_URL ? (
    <a
      className={linkClassName}
      href={EXPLORER_URL}
      rel="noopener noreferrer"
      target="_blank"
    >
      {children}
    </a>
  ) : (
    <span>{children}</span>
  )

const ImpactSummary = ({
  state,
  isLoading,
}: {
  readonly state: SubnameMigrationImpactState
  readonly isLoading: boolean
}) => {
  const isError = state.status === 'error'
  const affectedCount = state.impact?.affectedCount ?? 0
  const hasImpact = affectedCount > 0
  return (
    <div aria-live="polite" className="mt-5 shrink-0">
      {isLoading ? (
        <div
          className="flex items-center gap-2 py-3 text-ens-garnet-900/65 text-sm"
          role="status"
        >
          <LoaderCircle
            aria-hidden="true"
            className="size-4 motion-safe:animate-spin"
          />
          <Trans>Checking subname impact...</Trans>
        </div>
      ) : isError ? (
        <button
          className={`${linkClassName} min-h-11 px-1 text-sm`}
          onClick={state.retry}
          type="button"
        >
          <Trans>Check again</Trans>
        </button>
      ) : hasImpact ? (
        <div className="rounded-xl border border-ens-garnet-900/10 bg-white/60 p-4">
          <p className="mb-3 font-medium text-ens-garnet-900/65 text-xs uppercase tracking-wider">
            <Plural
              one="# affected subname"
              other="# affected subnames"
              value={affectedCount}
            />
          </p>
          <ul className="space-y-3">
            {state.impact?.parents.map(({ name, affectedCount: count }) => (
              <li
                className="flex items-baseline justify-between gap-4 text-sm"
                key={name}
              >
                <span className="min-w-0 break-all font-medium">{name}</span>
                <span className="shrink-0 text-ens-garnet-900/65 tabular-nums">
                  <Plural one="# subname" other="# subnames" value={count} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

export const SubnameMigrationDialog = ({
  open,
  selectedNameCount,
  state,
  isChecking,
  onCancel,
  onContinue,
  onRestoreFocus,
}: {
  readonly open: boolean
  readonly selectedNameCount: number
  readonly state: SubnameMigrationImpactState
  readonly isChecking: boolean
  readonly onCancel: () => void
  readonly onContinue: () => void
  readonly onRestoreFocus: () => void
}) => {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const isLoading = state.status === 'loading' || isChecking
  const isError = state.status === 'error'
  const affectedCount = state.impact?.affectedCount ?? 0
  const hasImpact = affectedCount > 0

  return (
    <Dialog onOpenChange={(next) => !next && onCancel()} open={open}>
      <DialogContent
        className="gap-0 overflow-y-auto rounded-3xl border-ens-garnet-900/10 bg-ens-quartz-100 p-6 text-ens-garnet-900 shadow-xl motion-reduce:animate-none sm:max-w-[520px] sm:p-8"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          onRestoreFocus()
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          cancelRef.current?.focus()
        }}
        overlayClassName="bg-ens-garnet-950/35 backdrop-blur-sm motion-reduce:animate-none"
        showCloseButton={false}
      >
        <div className="mb-5 flex size-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800">
          <CircleAlert aria-hidden="true" className="size-5" />
        </div>
        <DialogTitle className="text-balance font-normal text-2xl leading-tight tracking-[-0.025em] sm:text-[28px]">
          {isError ? (
            <Trans>We couldn&apos;t check your subnames</Trans>
          ) : isLoading ? (
            <Trans>Checking your subnames</Trans>
          ) : hasImpact ? (
            <Trans>Some subnames will stop resolving</Trans>
          ) : (
            <Trans>Your subnames are unaffected</Trans>
          )}
        </DialogTitle>
        <DialogDescription className="mt-3 shrink-0 text-pretty text-[15px] text-ens-garnet-900/75 leading-relaxed">
          {isError ? (
            <Trans>
              The impact is unknown. Try again or contact{' '}
              <a
                className={linkClassName}
                href="https://support.ens.domains"
                rel="noopener noreferrer"
                target="_blank"
              >
                support
              </a>{' '}
              before upgrading.
            </Trans>
          ) : isLoading ? (
            <Trans>Checking the latest name state before you continue.</Trans>
          ) : hasImpact ? (
            <>
              <Plural
                one="The selected name has subnames which will no longer resolve after upgrading to ENS v2."
                other="The selected names have subnames which will no longer resolve after upgrading to ENS v2."
                value={selectedNameCount}
              />{' '}
              <Trans>
                After upgrading, recreate the subnames in{' '}
                <ExplorerLink>ENS Explorer</ExplorerLink>. Please contact{' '}
                <a
                  className={linkClassName}
                  href="https://support.ens.domains"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  support
                </a>{' '}
                with any questions.
              </Trans>
            </>
          ) : (
            <Trans>
              The latest check found no affected subnames. You can continue with
              the upgrade.
            </Trans>
          )}
        </DialogDescription>
        <ImpactSummary isLoading={isLoading} state={state} />
        <div className="mt-7 flex shrink-0 flex-col-reverse gap-3 sm:flex-row">
          <button
            className="min-h-12 flex-1 rounded-xl border border-ens-garnet-900/15 bg-transparent px-5 font-medium text-sm transition-colors hover:bg-ens-garnet-900/5 focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none"
            onClick={onCancel}
            ref={cancelRef}
            type="button"
          >
            <Trans>Cancel</Trans>
          </button>
          <button
            className="min-h-12 flex-1 rounded-xl bg-ens-garnet-900 px-5 font-medium text-ens-quartz-100 text-sm transition-colors hover:bg-ens-garnet-800 focus-visible:outline-2 focus-visible:outline-ens-garnet-900 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
            disabled={isLoading || state.status !== 'ready' || !state.canReview}
            onClick={onContinue}
            type="button"
          >
            <Trans>Continue migration</Trans>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
