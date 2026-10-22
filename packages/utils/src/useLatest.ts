import { useEffect, useRef } from 'react'

/**
 * A ref to the latest value the page rendered, for a handler that reads it
 * when an event arrives: whatever the handler is passed to (wagmi's connection
 * watcher, the follower of a choice) then never sees it change, and so is not
 * set up again on every render.
 */
export const useLatest = <T>(value: T): { readonly current: T } => {
  const latest = useRef(value)
  useEffect(() => {
    latest.current = value
  })
  return latest
}
