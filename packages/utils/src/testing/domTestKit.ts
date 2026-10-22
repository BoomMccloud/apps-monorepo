import type { render, screen } from '@testing-library/react'

/**
 * What an app hands the shared view suites to drive its own components with.
 * The app passes its own Testing Library, so that the suites hold no copy of
 * React or of Testing Library, and says how it presses an element (its tests
 * use `fireEvent` or `user-event`).
 */
export type DomTestKit = {
  readonly render: typeof render
  readonly screen: typeof screen
  readonly press: (element: HTMLElement) => unknown
}
