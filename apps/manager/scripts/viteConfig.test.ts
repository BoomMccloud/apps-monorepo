import { loadConfigFromFile } from 'vite'
import { describe, expect, it } from 'vitest'

describe("the Manager's Vite config", () => {
  // The config imports the rules check, which reads the rules download. Vite
  // loads the config before any workspace package can be resolved by name, so
  // a module it reaches that imports one by name stops every `vite` command.
  it('loads, with the rules check and everything it imports', async () => {
    const loaded = await loadConfigFromFile(
      { command: 'serve', mode: 'ci' },
      'vite.config.ts',
      process.cwd(),
    )

    expect(loaded?.config).toBeDefined()
  })
})
