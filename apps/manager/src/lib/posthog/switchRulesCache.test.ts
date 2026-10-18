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

  it('reads nothing stored as no rules, without a word', async () => {
    const { space } = memoryKv()
    const onUnreadable = vi.fn()

    await expect(
      switchRulesReader(space, onUnreadable).getFlagDefinitions(),
    ).resolves.toBeUndefined()
    expect(onUnreadable).not.toHaveBeenCalled()
  })

  it('reads a value of another shape as no rules', async () => {
    const onUnreadable = vi.fn()
    for (const value of [
      '{"rules":{"flags":[]},"etag":null}',
      '{"flags":"none","groupTypeMapping":{},"cohorts":{}}',
      '[]',
      'null',
    ]) {
      const { space } = memoryKv({ [SWITCH_RULES_KEY]: value })
      await expect(
        switchRulesReader(space, onUnreadable).getFlagDefinitions(),
      ).resolves.toBeUndefined()
    }
    expect(onUnreadable).not.toHaveBeenCalled()
  })

  it('says why KV could not be read, and reads it as no rules', async () => {
    const failure = new Error('KV is unavailable')
    // Only `get` is read; the rest of the binding is not modelled.
    const unavailable = {
      get: async () => {
        throw failure
      },
    } as unknown as KVNamespace
    const onUnreadable = vi.fn()

    await expect(
      switchRulesReader(unavailable, onUnreadable).getFlagDefinitions(),
    ).resolves.toBeUndefined()
    expect(onUnreadable).toHaveBeenCalledExactlyOnceWith(failure)
  })

  it('reads a stored value that is not JSON as KV failing, since KV parses it', async () => {
    const { space } = memoryKv({ [SWITCH_RULES_KEY]: 'not json' })
    const onUnreadable = vi.fn()

    await expect(
      switchRulesReader(space, onUnreadable).getFlagDefinitions(),
    ).resolves.toBeUndefined()
    expect(onUnreadable).toHaveBeenCalledOnce()
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
      problems: expect.arrayContaining(['migration: missing from the rules']),
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
