import assert from 'node:assert/strict'
import { createServer as createHttpServer } from 'node:http'
import test from 'node:test'
import { createServer as createViteServer } from 'vite'

test('session checks treat only 401 responses as logged out', async () => {
  let responseStatus = 401
  const apiServer = createHttpServer((_request, response) => {
    response.writeHead(responseStatus, { 'Content-Type': 'application/json' })
    response.end(responseStatus === 401 ? '{"message":"unauthorized"}' : '{"message":"unavailable"}')
  })
  await new Promise<void>((resolve) => apiServer.listen(0, '127.0.0.1', resolve))
  const address = apiServer.address()
  assert(address && typeof address === 'object')
  process.env.VITE_API_URL = `http://127.0.0.1:${address.port}`

  const vite = await createViteServer({
    appType: 'custom',
    mode: 'test',
    server: { middlewareMode: true },
  })

  try {
    const { checkSession } = await vite.ssrLoadModule('/src/services/api.ts')

    assert.equal(await checkSession(), null)

    responseStatus = 503
    await assert.rejects(checkSession(), /503/)

    await new Promise<void>((resolve, reject) => {
      apiServer.close((error) => (error ? reject(error) : resolve()))
    })
    await assert.rejects(checkSession())
  } finally {
    if (apiServer.listening) {
      await new Promise<void>((resolve) => apiServer.close(() => resolve()))
    }
    await vite.close()
    delete process.env.VITE_API_URL
  }
})
