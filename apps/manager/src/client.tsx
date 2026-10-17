// Must stay the first import: PostHog's SDK keeps the `fetch` it finds when it
// loads, and this guard holds back what it sends until the visitor accepts.
import '@ens-apps/utils/analyticsSendGuard'
// Dev-only: install the Anvil-tracking browser clock before hydration
// (no-op unless DEV + VITE_TIME_TRAVEL).
import '@ens-apps/dev-time-travel/setup'
import { StartClient } from '@tanstack/react-start/client'
import { StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import reportWebVitals from './reportWebVitals'

hydrateRoot(
  document,
  <StrictMode>
    <StartClient />
  </StrictMode>,
)

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals()
