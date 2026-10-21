import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { PrivacySettingsPage } from '@/features/analytics/pages/PrivacySettingsPage'
import { Route as AddressRoute } from './$address/route'
import { Route as NameRoute } from './$name/route'
import { Route } from './privacy'

const ADDRESS = '0x0000000000000000000000000000000000000abc'

// The routes the generated tree adds to the root, built the way it builds them.
const matchedRouteId = (pathname: string): string | undefined => {
  const root = createRootRoute()
  const privacy = Route.update({
    id: '/privacy',
    path: '/privacy',
    getParentRoute: () => root,
  } as never)
  const name = NameRoute.update({
    id: '/$name',
    path: '/$name',
    getParentRoute: () => root,
  } as never)
  const address = AddressRoute.update({
    id: '/$address',
    path: '/$address',
    getParentRoute: () => root,
  } as never)
  const router = createRouter({
    routeTree: root.addChildren([privacy, name, address]),
    history: createMemoryHistory({ initialEntries: [pathname] }),
  })

  return router.matchRoutes(pathname, {}).at(-1)?.routeId
}

describe('the /privacy route', () => {
  it('shows the Privacy settings page under its own title', async () => {
    expect(Route.options.component).toBe(PrivacySettingsPage)

    const head = await Route.options.head?.({} as never)
    expect(head?.meta).toContainEqual({ title: 'Privacy settings - ENS App' })
  })

  it.each([
    '/privacy',
    '/privacy/',
  ])('is matched by %s ahead of the name and address routes', (pathname) => {
    expect(matchedRouteId(pathname)).toBe('/privacy')
  })

  it('leaves names and addresses to their own routes', () => {
    expect(matchedRouteId('/vitalik.eth')).toBe('/$name')
    expect(matchedRouteId(`/${ADDRESS}`)).toBe('/$address')
  })
})
