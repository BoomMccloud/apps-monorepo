import { Plural, Trans } from '@lingui/react/macro'
import { CircleAlert, LoaderCircle } from 'lucide-react'
import { useId } from 'react'
import type { SubnameMigrationImpactState } from '../hooks/useSubnameMigrationImpact'

export const SubnameMigrationWarning = ({
  state,
}: {
  readonly state: SubnameMigrationImpactState
}) => {
  const descriptionId = useId()
  if (state.status === 'idle') return null
  if (state.status === 'loading') {
    return (
      <p
        className="flex items-center gap-2 text-ens-garnet-900/75 text-sm"
        role="status"
      >
        <LoaderCircle
          aria-hidden="true"
          className="size-4 shrink-0 motion-safe:animate-spin"
        />
        <Trans>Checking the impact on existing subnames...</Trans>
      </p>
    )
  }
  if (state.status === 'ready' && state.impact?.affectedCount === 0) return null
  return (
    <div
      className="motion-safe:fade-in-0 w-full rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950 text-sm leading-normal motion-safe:animate-in"
      role="alert"
    >
      <div className="flex items-start gap-2">
        <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <div className="min-w-0 flex-1 space-y-3">
          {state.status === 'error' ? (
            <>
              <p className="font-medium">
                <Trans>We couldn&apos;t check your subnames</Trans>
              </p>
              <p>
                <Trans>
                  The impact is unknown. Try again or contact support before
                  upgrading.
                </Trans>
              </p>
              <button
                className="min-h-11 rounded-sm px-3 font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
                onClick={state.retry}
                type="button"
              >
                <Trans>Check again</Trans>
              </button>
            </>
          ) : (
            <>
              <p className="font-medium">
                <Trans>Subnames will stop resolving</Trans>
              </p>
              {/* Interim copy from WEB-1891; final language is tracked in WEB-1892. */}
              <p id={descriptionId}>
                <Trans>
                  The selected names have subnames that will no longer resolve
                  after upgrading to ENSv2 and will need to be recreated. Please
                  contact support if you have any questions.
                </Trans>
              </p>
              <ul className="max-h-32 space-y-2 overflow-y-auto">
                {state.impact?.parents.map(({ name, affectedCount }) => (
                  <li
                    className="flex flex-wrap justify-between gap-x-4 gap-y-1"
                    key={name}
                  >
                    <span className="min-w-0 break-all font-medium">
                      {name}
                    </span>
                    <span className="tabular-nums">
                      <Plural
                        one="# affected subname"
                        other="# affected subnames"
                        value={affectedCount}
                      />
                    </span>
                  </li>
                ))}
              </ul>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2">
                <input
                  aria-describedby={descriptionId}
                  checked={state.acknowledged}
                  className="mt-1 size-4 shrink-0 accent-amber-950 focus-visible:outline-2 focus-visible:outline-offset-2"
                  onChange={(event) => state.acknowledge(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  <Trans>
                    I understand that these subnames will stop resolving and
                    want to continue.
                  </Trans>
                </span>
              </label>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
