import { Trans } from '@lingui/react/macro'
import { ArrowUpRight } from 'lucide-react'
import { EXPLORER_URL } from '@/constants'

export const RegistryRolesNotice = ({
  name,
  isEditingRestricted = false,
}: {
  readonly name: string
  readonly isEditingRestricted?: boolean
}) => (
  <div className="space-y-1 text-ens-quartz-550 text-sm">
    {isEditingRestricted ? (
      <>
        <p className="font-medium text-ens-quartz-900">
          <Trans>Resolver permissions required</Trans>
        </p>
        <p>
          <Trans>
            Your current resolver permissions do not allow editing this profile
            in Manager. Ask a resolver administrator to review your record
            permissions.
          </Trans>
        </p>
      </>
    ) : (
      <p>
        <Trans>
          Registry roles control the name. Record-editing access depends on its
          resolver.
        </Trans>
      </p>
    )}
    {EXPLORER_URL ? (
      <a
        className="inline-flex min-h-11 items-center gap-1 text-ens-lapis-core underline underline-offset-4 hover:opacity-80 focus-visible:rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2"
        href={`${EXPLORER_URL}/${name}/roles`}
        rel="noopener noreferrer"
        target="_blank"
      >
        <Trans>View roles in Explorer</Trans>
        <ArrowUpRight aria-hidden="true" className="size-4 shrink-0" />
      </a>
    ) : null}
  </div>
)
