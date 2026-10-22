import { readAllCollectionPages } from '@ens-apps/indexer/bigname'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import type { Address } from 'viem'
import { bigname } from '@/lib/bigname'

/** Registry grants explain a name's listing; resolver write access is checked separately. */
export const profileRegistryAccessQuery = (
  name: string,
  address: Address | undefined,
) =>
  resultQueryOptions({
    queryKey: qk('profile', 'registry_access', { name, address }),
    queryFn: address
      ? ({ signal }) =>
          readAllCollectionPages(
            (cursor, requestSignal) =>
              bigname.permissions(
                { name, address, namespace: 'ens', page_size: 100, cursor },
                { signal: requestSignal },
              ),
            { signal },
          ).map((rows) =>
            rows.some(
              (row) =>
                row.address.toLowerCase() === address.toLowerCase() &&
                row.authority_context !== 'resource_audit' &&
                row.powers.length > 0 &&
                (row.grant_scope.kind === 'registration' ||
                  row.grant_scope.kind === 'registry' ||
                  row.grant_scope.kind === 'root'),
            ),
          )
      : skipToken,
    meta: { dependsOn: ['indexer'] },
  })
