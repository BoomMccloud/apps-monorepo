/**
 * Migration deep into, and after, the V1 grace period (GA7, GA8).
 *
 * **This file moves the shared fork clock 91 days forward, permanently.** It
 * runs in its own project (`manager-migration-time`), after every other
 * migration spec, and nothing may depend on the clock it leaves behind.
 *
 * Mechanics (contracts-v2 `AbstractETHRegistrar.renew` / `ETHRenewerV1`):
 * pre-migration reserves a V1 name in V2 until `v1Expiry + PREMIGRATION_BONUS`
 * (62 days). Renewing sets the V2 expiry to `reservedExpiry + duration` *and*
 * extends V1 by the same `duration`. The migration then registers the slot with
 * its reserved expiry. So after renew-then-upgrade the V2 expiry is exactly the
 * renewed V1 expiry plus the bonus — the relationship GA7 asserts at day 45
 * (slot still RESERVED) and day 89 (slot already lapsed to AVAILABLE, inside
 * the renewer's 28-day window). Past day 90 the renewer refuses, so the name
 * must not be offered at all (GA8).
 *
 * Seeded with `makeGraceV1Name` (a ~90 s registration reserved with the real
 * bonus), then the clock is walked so three names sit at day 91, 89 and 45.
 */
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { labelToCanonicalId } from '@ensdomains/ensjs/utils/v2'
import type { Page } from '@playwright/test'
import {
  type Address,
  encodeFunctionData,
  keccak256,
  namehash,
  parseAbi,
  toHex,
  zeroAddress,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  type GraceV1Name,
  makeGraceV1Name,
  PREMIGRATION_BONUS_PERIOD,
  syncBrowserToChain,
} from '../../../fixtures/makeGraceV1Name.js'
import {
  createMakeV1Name,
  reserveInV2,
  V1_ENS_REGISTRY,
} from '../../../fixtures/makeV1Name.js'
import {
  authorizeTransactionsWhile,
  expect,
  test,
} from '../../../fixtures/playwright.manager.fixture.js'
import { discoverV1CompatResolver } from '../../../fixtures/premigration.js'
import {
  APP_V1_CONTROLLER,
  ensureV1ControllersAuthorised,
} from '../../../fixtures/v1-controller-auth.js'
import { setV1RecordsOn, type V1Records } from '../../../fixtures/v1-records.js'
import {
  publicClient,
  testClient,
  walletClient,
} from '../../../helpers/anvil-client.js'
import { isRealBigname } from '../../../helpers/bigname-sync.js'
import {
  assertUnlockedMigration,
  assertV2Reserved,
  readGraveyard,
} from '../../../helpers/migration-assertions.js'
import { selectOnlyRoots } from '../../../helpers/migration-flow.js'
import type { MockV1Name } from '../../../helpers/mock-v1-subgraph.js'
import {
  dnsEncode,
  expectRecordsResolve,
  resolveRecords,
  resolverFor,
} from '../../../helpers/resolve-records.js'
import { serveV1Names } from '../../../helpers/v1-names.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'

const sepolia = ensL1Contracts[supportedL1Chains.sepolia]
const BASE_REGISTRAR = sepolia.ensBaseRegistrarImplementation.address as Address
const ETH_REGISTRY = sepolia.ensRegistry.address as Address
const ETH_REGISTRAR = sepolia.ensEthRegistrar.address as Address
const RENEWER = sepolia.ensEthRenewerV1.address as Address

const DAY = 24 * 60 * 60

const BASE_REGISTRAR_ABI = parseAbi([
  'function nameExpires(uint256 id) view returns (uint256)',
  'function renew(uint256 id, uint256 duration) returns (uint256)',
])
const NAME_WRAPPER = sepolia.ensNameWrapper.address as Address
const GRAVEYARD_ABI = parseAbi(['function clear(bytes[] names)'])
const V1_TOKEN_ABI = parseAbi([
  'function ownerOf(uint256 tokenId) view returns (address)',
])
const V1_REGISTRY_ABI = parseAbi([
  'function owner(bytes32 node) view returns (address)',
  'function resolver(bytes32 node) view returns (address)',
])
const V2_RESOLVER_ABI = parseAbi([
  'function getResolver(string label) view returns (address)',
])
const NAME_WRAPPER_ABI = parseAbi([
  'function getData(uint256 tokenId) view returns (address owner, uint32 fuses, uint64 expiry)',
])
const REGISTRY_ABI = parseAbi([
  'struct State { uint8 status; uint64 expiry; address latestOwner; uint256 tokenId; uint256 resource; }',
  'function getState(uint256 anyId) view returns (State state)',
])
const RENEWER_ABI = parseAbi([
  'function isRenewable(string label) view returns (bool)',
])
const REGISTRAR_ABI = parseAbi([
  'function isAvailable(string label) view returns (bool)',
])

const AVAILABLE = 0

const warpDays = async (days: number) => {
  await testClient.increaseTime({ seconds: Math.round(days * DAY) })
  await testClient.mine({ blocks: 1 })
}

const chainNow = async () =>
  (await publicClient.getBlock({ blockTag: 'latest', cacheTime: 0 } as never))
    .timestamp

const graceDay = async (grace: GraceV1Name) =>
  Number((await chainNow()) - grace.expiry) / DAY

const v1Expiry = (grace: GraceV1Name) =>
  publicClient.readContract({
    address: BASE_REGISTRAR,
    abi: BASE_REGISTRAR_ABI,
    functionName: 'nameExpires',
    args: [grace.tokenId],
  })

const v2State = (label: string) =>
  publicClient.readContract({
    address: ETH_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: 'getState',
    args: [labelToCanonicalId(label)],
  })

const graceMock = (grace: GraceV1Name, owner: Address): MockV1Name => ({
  name: grace.name,
  ownerAddress: owner,
  type: 'unwrapped',
  expiryDate: Number(grace.expiry),
})

/** The checkbox for a name on /upgrade, once the list has rendered. */
const nameCheckbox = (page: Page, name: string) =>
  page.getByRole('checkbox', { name, exact: true })

test.describe('Migration deep into and after the V1 grace period', () => {
  test.describe.configure({ timeout: 600_000 })

  test('renew-then-upgrade works at grace day 45 and day 89 with V2 expiry = renewed V1 expiry + bonus; past grace the name is not offered and is open to registration', {
    tag: ['@scenario:GA7', '@scenario:GA8'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))

    // ── Walk the clock: one name per point in the grace period ──
    const lapsed = await makeGraceV1Name({ label: 'ga8-lapsed', owner })
    await warpDays(2)
    const day89 = await makeGraceV1Name({ label: 'ga7-day89', owner })
    await warpDays(44)
    const day45 = await makeGraceV1Name({ label: 'ga7-day45', owner })
    await warpDays(45)

    expect(await graceDay(day45)).toBeGreaterThan(44.9)
    expect(await graceDay(day45)).toBeLessThan(45.1)
    expect(await graceDay(day89)).toBeGreaterThan(88.9)
    expect(await graceDay(day89)).toBeLessThan(90)
    expect(await graceDay(lapsed)).toBeGreaterThan(90)

    // The three V2 states the app has to handle.
    await assertV2Reserved(day45.label)
    expect(
      (await v2State(day89.label)).status,
      'day 89: reservation lapsed',
    ).toBe(AVAILABLE)
    for (const [grace, renewable] of [
      [day45, true],
      [day89, true],
      [lapsed, false],
    ] as const) {
      expect(
        await publicClient.readContract({
          address: RENEWER,
          abi: RENEWER_ABI,
          functionName: 'isRenewable',
          args: [grace.label],
        }),
        `isRenewable(${grace.label})`,
      ).toBe(renewable)
    }

    // A plain active name, seeded after the warps: the control that proves
    // the list rendered at all when the lapsed name is absent.
    const control = await createMakeV1Name({ userAccount: owner })({
      label: 'ga8-control',
    })

    await serveV1Names(page, [
      graceMock(lapsed, owner.address),
      graceMock(day89, owner.address),
      graceMock(day45, owner.address),
      { name: control, ownerAddress: owner.address, type: 'unwrapped' },
    ])
    await syncBrowserToChain(page)
    await page.goto(`${MANAGER_APP_URL}/upgrade`)

    // ── GA8: past grace, not offered ──
    await expect(nameCheckbox(page, control)).toBeVisible({ timeout: 60_000 })
    await expect(nameCheckbox(page, day45.name)).toBeVisible()
    await expect(nameCheckbox(page, day89.name)).toBeVisible()
    await expect(
      page.getByText(lapsed.name, { exact: true }),
      'a name past its grace period must not be offered for upgrade',
    ).toHaveCount(0)

    // ── GA7: renew then upgrade the two grace names (not the control) ──
    // `selectOnlyRoots`, not "untick the control": on a real index the shared
    // wallet lists every name it ever made, all ticked by default.
    await selectOnlyRoots(page, [day45.name, day89.name])
    await expect(nameCheckbox(page, control)).not.toBeChecked()
    for (const grace of [day45, day89])
      await expect(nameCheckbox(page, grace.name)).toBeChecked()

    const upgrade = page.getByRole('button', { name: /^Upgrade 2 names$/ })
    await expect(upgrade).toBeEnabled({ timeout: 90_000 })
    let done = false
    const authorizeAll = authorizeTransactionsWhile(page, wallet, () => done)
    await upgrade.click()
    await expect(
      page.getByRole('heading', { name: /your names have been upgraded/i }),
    ).toBeVisible({ timeout: 240_000 })
    done = true
    await authorizeAll

    const now = await chainNow()
    for (const grace of [day45, day89]) {
      const renewed = await v1Expiry(grace)
      expect(renewed, `${grace.label}: V1 renewed past now`).toBeGreaterThan(
        now,
      )
      await assertUnlockedMigration(grace.label)
      const state = await v2State(grace.label)
      expect(
        BigInt(state.expiry),
        `${grace.label}: V2 expiry must be the renewed V1 expiry plus the pre-migration bonus`,
      ).toBe(renewed + PREMIGRATION_BONUS_PERIOD)
    }

    // ── GA8: …and the lapsed name is open to anyone ──
    expect(
      await publicClient.readContract({
        address: ETH_REGISTRAR,
        abi: REGISTRAR_ABI,
        functionName: 'isAvailable',
        args: [lapsed.label],
      }),
      'a name past V1 grace must be available to register in V2',
    ).toBe(true)
    await page.goto(`${MANAGER_APP_URL}/register/${lapsed.name}`)
    await expect(page).toHaveURL(new RegExp(`/register/${lapsed.label}`), {
      timeout: 30_000,
    })
  })
})

test.describe('Migration of a desynced 2LD (§G.GW)', () => {
  test.describe.configure({ timeout: 600_000 })

  test('a 2LD renewed on the registrar but expired in the NameWrapper is accounted for on /upgrade', {
    tag: ['@scenario:GW4'],
  }, async ({ migrationConnectedPage: page, accounts }) => {
    // The bigname route mock has one expiry for registrar and wrapper; the
    // disagreement is the whole shape, so only a live index can serve it.
    test.skip(
      !isRealBigname,
      'needs the local bigname: the mock cannot split the two expiries',
    )
    test.fail(
      true,
      'E2E-027: a desynced wrapped 2LD has no owner in the index, so the owner never sees it and is never offered syncWrapper',
    )
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const makeV1Name = createMakeV1Name({ userAccount: owner })

    // ens-app-v3 `registrationStatus` "desynced": the registrar expiry is in
    // the future, the NameWrapper reports owner 0. It arises when a wrapped
    // name is renewed on the registrar alone (a legacy controller) — the
    // wrapper's own expiry never moves, lapses, and with PARENT_CANNOT_CONTROL
    // burnt (every wrapped .eth 2LD) the wrapper zeroes the owner.
    const name = await makeV1Name({
      label: 'gw4-desync',
      type: 'wrapped',
      duration: 28 * DAY,
      reserveInV2: false,
    })
    const label = name.replace(/\.eth$/, '')
    const tokenId = BigInt(keccak256(toHex(label)))

    await ensureV1ControllersAuthorised()
    await testClient.impersonateAccount({ address: APP_V1_CONTROLLER })
    await testClient.setBalance({
      address: APP_V1_CONTROLLER,
      value: 10n ** 19n,
    })
    try {
      const hash = await walletClient.sendTransaction({
        account: APP_V1_CONTROLLER,
        to: BASE_REGISTRAR,
        data: encodeFunctionData({
          abi: BASE_REGISTRAR_ABI,
          functionName: 'renew',
          args: [tokenId, BigInt(365 * DAY)],
        }),
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      expect(receipt.status, 'registrar-only renewal').toBe('success')
    } finally {
      await testClient.stopImpersonatingAccount({ address: APP_V1_CONTROLLER })
    }
    const registrarExpiry = await publicClient.readContract({
      address: BASE_REGISTRAR,
      abi: BASE_REGISTRAR_ABI,
      functionName: 'nameExpires',
      args: [tokenId],
    })
    // Reserve in V2 at the renewed expiry, so a lapsed reservation cannot be
    // why the name is missing.
    await reserveInV2(label, registrarExpiry)

    // Past the wrapper's expiry (registrar + 90 days, from the 28-day lease).
    await warpDays(28 + 90 + 2)
    const [wrapperOwner, , wrapperExpiry] = await publicClient.readContract({
      address: NAME_WRAPPER,
      abi: NAME_WRAPPER_ABI,
      functionName: 'getData',
      args: [BigInt(namehash(name))],
    })
    const now = await chainNow()
    expect(
      registrarExpiry,
      'precondition: the registrar lease is live',
    ).toBeGreaterThan(now)
    expect(wrapperExpiry, 'precondition: the wrapper has lapsed').toBeLessThan(
      now,
    )
    expect(wrapperOwner, 'precondition: the wrapper reports no owner').toBe(
      zeroAddress,
    )
    expect(await v2State(label)).toMatchObject({ status: 1 })

    // A fresh, ordinary name after the warp: the list rendered at all.
    const control = await makeV1Name({ label: 'gw4-control', type: 'wrapped' })

    await serveV1Names(page, [
      { name, ownerAddress: owner.address, type: 'wrapped' },
      { name: control, ownerAddress: owner.address, type: 'wrapped' },
    ])
    await syncBrowserToChain(page)
    await page.goto(`${MANAGER_APP_URL}/upgrade`)
    await expect(nameCheckbox(page, control)).toBeVisible({ timeout: 60_000 })
    // INV3: every input lands in a visible bucket — offered, or listed as not
    // upgradable with a reason. Silence is the one wrong answer.
    await expect(
      page.getByText(name, { exact: false }).first(),
      'the desynced name is accounted for',
    ).toBeVisible({ timeout: 15_000 })
  })
})

test.describe('An unmigrated V1 name after its V1 expiry (GA9)', () => {
  test.describe.configure({ timeout: 600_000 })

  test('resolves through the ENSV1Resolver until the V2 reservation lapses; after V1 grace anyone can clear it into the Graveyard', {
    tag: ['@scenario:GA9'],
  }, async ({ accounts }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const stranger = privateKeyToAccount(accounts.getPrivateKey('user2'))
    // Registered, reserved in V2 at expiry + PREMIGRATION_BONUS_PERIOD (as
    // premigration does), and stepped just past its V1 expiry E.
    const g = await makeGraceV1Name({ label: 'ga9-unmigrated', owner })
    const records: V1Records = {
      texts: [{ key: 'description', value: 'never migrated' }],
    }
    await setV1RecordsOn(g.name, owner, false, records)
    const compat = await discoverV1CompatResolver()

    // ── E … E + bonus: RESERVED, V1 data served through the ENSV1Resolver ──
    expect(await v2State(g.label)).toMatchObject({ status: 1 })
    expect(
      (await resolverFor(g.name)).toLowerCase(),
      'the V2 registry routes the name to the ENSV1Resolver',
    ).toBe(compat.toLowerCase())
    await expectRecordsResolve(g.name, records)

    // ── past E + bonus: the reservation lapses, so does resolution ──
    await warpDays(Number(PREMIGRATION_BONUS_PERIOD) / DAY + 1)
    expect((await v2State(g.label)).status, 'AVAILABLE in V2').toBe(AVAILABLE)
    expect(
      await publicClient.readContract({
        address: ETH_REGISTRY,
        abi: V2_RESOLVER_ABI,
        functionName: 'getResolver',
        args: [g.label],
      }),
      'an expired reservation has no resolver',
    ).toBe(zeroAddress)
    const [lapsed] = await resolveRecords(g.name, records)
    expect(lapsed.got, 'the V1 records no longer resolve').not.toBe(lapsed.want)

    // ── still inside V1 grace: the Graveyard cannot take it yet ──
    const graveyard = await readGraveyard()
    const clear = () =>
      walletClient.sendTransaction({
        account: stranger,
        to: graveyard,
        data: encodeFunctionData({
          abi: GRAVEYARD_ABI,
          functionName: 'clear',
          args: [[dnsEncode(g.name)]],
        }),
      })
    await expect(clear(), 'not clearable inside V1 grace').rejects.toThrow()

    // ── past E + 90 days: anyone may clear it ──
    await warpDays(90 - Number(PREMIGRATION_BONUS_PERIOD) / DAY)
    const hash = await clear()
    expect(
      (await publicClient.waitForTransactionReceipt({ hash })).status,
      'a stranger clears the expired V1 name',
    ).toBe('success')

    const node = namehash(g.name)
    const [registrant, registryOwner, v1Resolver] = await Promise.all([
      publicClient.readContract({
        address: BASE_REGISTRAR,
        abi: V1_TOKEN_ABI,
        functionName: 'ownerOf',
        args: [g.tokenId],
      }),
      publicClient.readContract({
        address: V1_ENS_REGISTRY,
        abi: V1_REGISTRY_ABI,
        functionName: 'owner',
        args: [node],
      }),
      publicClient.readContract({
        address: V1_ENS_REGISTRY,
        abi: V1_REGISTRY_ABI,
        functionName: 'resolver',
        args: [node],
      }),
    ])
    expect(registrant, 'the V1 token sits in the Graveyard').toBe(graveyard)
    expect(registryOwner, 'so does the registry record').toBe(graveyard)
    expect(v1Resolver, 'and its V1 resolver is cleared').toBe(zeroAddress)
    expect(
      await publicClient.readContract({
        address: ETH_REGISTRAR,
        abi: REGISTRAR_ABI,
        functionName: 'isAvailable',
        args: [g.label],
      }),
      'and the name is open to register in V2',
    ).toBe(true)
  })
})
