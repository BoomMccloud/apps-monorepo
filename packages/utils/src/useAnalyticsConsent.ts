import { useContext } from 'react'
import {
  AnalyticsConsentContext,
  type AnalyticsConsentValue,
} from './analyticsConsentContext'

export const useAnalyticsConsent = (): AnalyticsConsentValue =>
  useContext(AnalyticsConsentContext)
