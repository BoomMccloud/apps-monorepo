// A caching JSON-RPC proxy for Anvil's fork upstream.
//
// Anvil forks a pinned block (start-local-env.sh), so everything it asks the
// upstream names that block explicitly — the fork block's header, code,
// storage slots, balances and nonces at that height — and the answer can never
// change. This keeps each answer on disk (CACHE_DIR) and serves it from there
// afterwards. Anvil's own storage.json cache is not enough on its own: Anvil
// still fetches the fork block's header from the network to start.
//
// Requests that name a moving tag (latest, pending, safe, finalized) are
// passed through uncached. With UPSTREAM_CACHE_OFFLINE=1 a cache miss is an
// error instead of a request — the way to prove the stack needs no public RPC.
//
// Zero dependencies; node:22 runs it as is.
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'

const PORT = Number(process.env.PORT ?? 8548)
const UPSTREAM = process.env.UPSTREAM_RPC_URL
const OFFLINE = process.env.UPSTREAM_CACHE_OFFLINE === '1'
const CACHE_DIR = process.env.CACHE_DIR ?? '/cache'
if (!UPSTREAM && !OFFLINE)
  throw new Error('UPSTREAM_RPC_URL is required (or UPSTREAM_CACHE_OFFLINE=1)')
await mkdir(CACHE_DIR, { recursive: true })

const MOVING = new Set(['latest', 'pending', 'safe', 'finalized', 'earliest'])
const stats = { hits: 0, misses: 0 }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const cacheable = ({ params = [] }) =>
  !JSON.stringify(params)
    .match(/"([a-z]+)"/g)
    ?.some((m) => MOVING.has(m.slice(1, -1)))

const cachePath = ({ method, params = [] }) =>
  path.join(
    CACHE_DIR,
    `${createHash('sha256')
      .update(`${method}:${JSON.stringify(params)}`)
      .digest('hex')}.json`,
  )

async function cached(request) {
  if (!cacheable(request)) return undefined
  try {
    return JSON.parse(await readFile(cachePath(request), 'utf8'))
  } catch {
    return undefined
  }
}

async function store(request, reply) {
  if (!cacheable(request) || reply.error || reply.result == null) return
  const file = cachePath(request)
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
  await writeFile(tmp, JSON.stringify(reply.result))
  await rename(tmp, file)
}

/** POST upstream with retries: public endpoints throttle bursts. */
async function post(body) {
  let lastError
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(UPSTREAM, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`upstream answered ${res.status}`)
      return await res.json()
    } catch (error) {
      lastError = error
      await sleep(250 * 2 ** attempt)
    }
  }
  console.error(`[upstream-cache] giving up: ${lastError.message}`)
  throw lastError
}

async function answer(request) {
  const hit = await cached(request)
  if (hit !== undefined) {
    stats.hits++
    return { jsonrpc: '2.0', id: request.id, result: hit }
  }
  stats.misses++
  if (OFFLINE)
    return {
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32603,
        message: `upstream-cache offline: no cached answer for ${request.method}`,
      },
    }
  const reply = await post(request)
  await store(request, reply)
  return reply
}

const server = http.createServer(async (req, res) => {
  let body = ''
  for await (const chunk of req) body += chunk
  try {
    const parsed = JSON.parse(body)
    const reply = Array.isArray(parsed)
      ? await Promise.all(parsed.map(answer))
      : await answer(parsed)
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(reply))
  } catch (error) {
    res.writeHead(502, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32603, message: `upstream-cache: ${error.message}` },
      }),
    )
  }
})

setInterval(() => {
  if (stats.hits + stats.misses === 0) return
  console.log(`[upstream-cache] ${stats.hits} hits, ${stats.misses} misses`)
  stats.hits = 0
  stats.misses = 0
}, 60_000)
server.listen(PORT, () =>
  console.log(
    `[upstream-cache] :${PORT} → ${UPSTREAM ?? '(none)'} cache ${CACHE_DIR}${OFFLINE ? ' OFFLINE' : ''}`,
  ),
)
