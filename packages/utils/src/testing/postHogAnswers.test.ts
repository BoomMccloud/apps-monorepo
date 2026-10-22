import { describe, expect, it } from 'vitest'
import { POSTHOG_PROJECT_SETTINGS, postHogAnswerFor } from './postHogAnswers'

const RULES = { flags: [], group_type_mapping: {}, cohorts: {} }
const SURVEYS = [{ id: 'survey' }]
const SERVED = {
  projectSettings: POSTHOG_PROJECT_SETTINGS,
  surveys: SURVEYS,
  rules: RULES,
}

describe("PostHog's host, as the fakes answer for it", () => {
  it.each([
    ['the switch rules', '/api/feature_flag/local_evaluation', RULES],
    ['the project settings', '/array/phc_key/config', POSTHOG_PROJECT_SETTINGS],
    [
      'the project settings as a script',
      '/array/phc_key/config.js',
      POSTHOG_PROJECT_SETTINGS,
    ],
    ['the surveys', '/api/surveys/', { surveys: SURVEYS }],
    [
      'no switches',
      '/flags/',
      {
        flags: {},
        featureFlags: {},
        featureFlagPayloads: {},
        errorsWhileComputingFlags: false,
      },
    ],
    ['an acknowledgement', '/e/', { status: 1 }],
  ])('serves %s at %s', (_what, path, answer) => {
    expect(postHogAnswerFor(path, SERVED)).toEqual(answer)
  })

  it('serves no switch rules where it was given none', () => {
    expect(
      postHogAnswerFor('/api/feature_flag/local_evaluation', {
        projectSettings: POSTHOG_PROJECT_SETTINGS,
        surveys: [],
      }),
    ).toEqual({ status: 1 })
  })
})
