import { fileURLToPath } from 'node:url'
import { cloudflare } from '@cloudflare/vite-plugin'
import { lingui, linguiTransformerBabelPreset } from '@lingui/vite-plugin'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type UserConfig } from 'vite'
import {
  assertDeploymentEnvironment,
  assertNetworkConfig,
} from '../../packages/config/src/index'
import { checkSwitchRulesForBuild } from './scripts/switchRulesBuildCheck'
import { MANAGER_ENDPOINTS } from './src/endpoints'

/**
 * A build must not deploy a Manager whose switches the live rules cannot
 * decide, so it checks them in the env of its own mode. Without the secret
 * key it skips the check and says so, unless a Cloudflare Workers build of the
 * production branch, which deploys, is missing it. A Storybook build deploys no
 * Worker, and a Workers build of another branch makes a preview: both skip it.
 */
const assertSwitchRulesDecideEverySwitch = async (
  env: Readonly<Record<string, string | undefined>>,
): Promise<void> => {
  const check = await checkSwitchRulesForBuild(env, {
    isSkippedWithoutKey: true,
  })
  if (check.status === 'failed') {
    throw new Error(`Feature switch rules rejected:\n${check.message}`)
  }
  console.log(check.message)
}

// https://vitejs.dev/config/
export default defineConfig(async ({ command, mode }): Promise<UserConfig> => {
  const env = loadEnv(mode, process.cwd(), '')
  assertDeploymentEnvironment(env, mode)
  // Validate here so direct Vite commands and --mode use the same env files.
  assertNetworkConfig(env, { endpoints: MANAGER_ENDPOINTS })
  if (command === 'build') await assertSwitchRulesDecideEverySwitch(env)
  return {
    server: {
      port: 3000,
      // The cross-app browser tests serve both apps under one parent domain,
      // as production does, to share the analytics choice (e2e/projects/
      // cross-app). `.test` never resolves on the public internet.
      allowedHosts: ['.ens.test'],
      proxy: {
        '/api': {
          target: 'http://localhost:2999',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
        // Local E2E: proxy RPC to Anvil fork.
        '/rpc': {
          target: 'http://127.0.0.1:8545',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rpc/, ''),
        },
        // Local E2E: proxy bundler + paymaster to avoid CORS.
        '/bundler': {
          target: 'http://127.0.0.1:4337',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/bundler/, ''),
        },
        '/paymaster': {
          target: 'http://127.0.0.1:3002',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/paymaster/, ''),
        },
        '/orchestrator': {
          target: 'http://127.0.0.1:3007',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/orchestrator/, ''),
        },
      },
    },
    plugins: [
      cloudflare({
        viteEnvironment: { name: 'ssr' },
      }),
      tanstackStart(),
      viteReact(),
      lingui(),
      babel({
        presets: [linguiTransformerBabelPreset()],
      }),
      tailwindcss(),
    ],
    optimizeDeps: {
      // Pre-bundle deps that Vite discovers late (during route navigation).
      // Without this, Vite re-optimises mid-session and triggers a full page
      // reload, which can crash React (especially in headless CI browsers).
      include: [
        'buffer',
        '@rhinestone/sdk',
        '@rhinestone/sdk/actions/smart-sessions',
        '@rhinestone/sdk/errors',
      ],
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    build: {
      rolldownOptions: {
        experimental: {
          lazyBarrel: true, // Reduces compiled modules for barrel exports
        },
      },
    },
  }
})
