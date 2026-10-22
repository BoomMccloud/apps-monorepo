import { describe, expect, it, vi } from 'vitest'
import {
  flagRule,
  forEveryone,
  memoryKv,
  switchRules,
} from './switchRules.mock'
import {
  SWITCH_RULES_KEY,
  switchRulesReader,
  switchRulesWriter,
} from './switchRulesCache'

describe('the Reader, which a request reads the rules with', () => {
  it('hands the SDK the rules KV holds, and never asks to fetch or to write', async () => {
    const { space } = memoryKv({
      [SWITCH_RULES_KEY]: JSON.stringify(switchRules()),
    })
    const reader = switchRulesReader(space, vi.fn())

    await expect(reader.getFlagDefinitions()).resolves.toEqual(switchRules())
    expect(reader.shouldFetchFlagDefinitions()).toBe(false)
  })

  it('reads nothing stored, or a stored null, as no rules, without a word', async () => {
    const onFailure = vi.fn()
    const stores: readonly Readonly<Record<string, string>>[] = [
      {},
      { [SWITCH_RULES_KEY]: 'null' },
    ]

    for (const initial of stores) {
      const { space } = memoryKv(initial)
      await expect(
        switchRulesReader(space, onFailure).getFlagDefinitions(),
      ).resolves.toBeUndefined()
    }
    expect(onFailure).not.toHaveBeenCalled()
  })

  it.each([
    [
      'the removed store, which kept the rules and an ETag',
      '{"rules":{"flags":[]},"etag":null}',
      'an object with the keys etag, rules',
    ],
    [
      'rules whose flags are not a list',
      '{"flags":"none","groupTypeMapping":{},"cohorts":{}}',
      'an object with the keys cohorts, flags, groupTypeMapping',
    ],
    ['a list', '[]', 'an array'],
    ['a string', '"switch rules"', 'a string'],
    ['a number', '7', 'a number'],
  ])('says that a value of another shape is stored, %s, and reads it as no rules', async (_what, stored, found) => {
    const { space } = memoryKv({ [SWITCH_RULES_KEY]: stored })
    const onFailure = vi.fn()

    await expect(
      switchRulesReader(space, onFailure).getFlagDefinitions(),
    ).resolves.toBeUndefined()
    expect(onFailure).toHaveBeenCalledExactlyOnceWith({
      status: 'unrecognized',
      found,
    })
  })

  it('says why KV could not be read, and reads it as no rules', async () => {
    const failure = new Error('KV is unavailable')
    // Only `get` is read; the rest of the binding is not modelled.
    const unavailable = {
      get: async () => {
        throw failure
      },
    } as unknown as KVNamespace
    const onFailure = vi.fn()

    await expect(
      switchRulesReader(unavailable, onFailure).getFlagDefinitions(),
    ).resolves.toBeUndefined()
    expect(onFailure).toHaveBeenCalledExactlyOnceWith({
      status: 'unreadable',
      cause: failure,
    })
  })

  it('reads a stored value that is not JSON as KV failing, since KV parses it', async () => {
    const { space } = memoryKv({ [SWITCH_RULES_KEY]: 'not json' })
    const onFailure = vi.fn()

    await expect(
      switchRulesReader(space, onFailure).getFlagDefinitions(),
    ).resolves.toBeUndefined()
    expect(onFailure).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ status: 'unreadable' }),
    )
  })
})

describe('the Writer, which the scheduled job has the SDK hand its fetch to', () => {
  const writing = () => {
    const { space, contents } = memoryKv()
    const write = vi.fn(async (rules: unknown) => {
      await space.put(SWITCH_RULES_KEY, JSON.stringify(rules))
    })
    return { write, contents, writer: switchRulesWriter(write) }
  }

  it('always asks to fetch, and holds nothing to read back', async () => {
    const { writer } = writing()

    expect(writer.provider.shouldFetchFlagDefinitions()).toBe(true)
    expect(await writer.provider.getFlagDefinitions()).toBeUndefined()
  })

  it('writes the rules that pass the rules check, and says it accepted them', async () => {
    const { writer, write, contents } = writing()

    await writer.provider.onFlagDefinitionsReceived(switchRules())

    expect(write).toHaveBeenCalledExactlyOnceWith(switchRules())
    expect(JSON.parse(contents().get(SWITCH_RULES_KEY) ?? 'null')).toEqual(
      switchRules(),
    )
    expect(writer.outcome()).toEqual({
      status: 'accepted',
      rules: switchRules(),
    })
  })

  it('writes nothing for rules that fail the rules check, and says what is wrong with them', async () => {
    const { writer, write, contents } = writing()

    await writer.provider.onFlagDefinitionsReceived(
      switchRules({ migration: undefined }),
    )

    expect(write).not.toHaveBeenCalled()
    expect(contents().size).toBe(0)
    expect(writer.outcome()).toMatchObject({
      status: 'refused',
      issues: expect.arrayContaining(['migration: missing from the rules']),
    })
  })

  it('checks every rule before it writes any, so a rule only PostHog could decide is never stored', async () => {
    const { writer, write } = writing()
    const experienceContinuity = switchRules({
      i18n: flagRule('i18n', [forEveryone()], {
        ensure_experience_continuity: true,
      }),
    })

    await writer.provider.onFlagDefinitionsReceived(experienceContinuity)

    expect(write).not.toHaveBeenCalled()
    expect(writer.outcome()).toMatchObject({ status: 'refused' })
  })

  it('says the rules passed and could not be written, when the write fails', async () => {
    const failure = new Error('KV is unavailable')
    const writer = switchRulesWriter(async () => {
      throw failure
    })

    await writer.provider.onFlagDefinitionsReceived(switchRules())

    expect(writer.outcome()).toEqual({ status: 'unwritten', cause: failure })
  })

  it('has done nothing until the SDK hands it rules', () => {
    expect(writing().writer.outcome()).toBeUndefined()
  })
})
