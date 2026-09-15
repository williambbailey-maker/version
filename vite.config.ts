/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import type { Plugin } from 'vite'

/** Serve the Vercel edge function locally so "Fetch info" works in dev. */
function packInfoDev(): Plugin {
  return {
    name: 'pack-info-dev',
    configureServer(server) {
      server.middlewares.use('/api/pack-info', async (req, res) => {
        const mod = (await server.ssrLoadModule('/api/pack-info.ts')) as { default: (r: Request) => Promise<Response> }
        const out = await mod.default(new Request(`http://localhost${req.url ?? ''}`))
        res.statusCode = out.status
        res.setHeader('content-type', 'application/json')
        res.end(await out.text())
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), packInfoDev()],
  test: {
    include: ['src/**/*.test.ts'],
  },
})
