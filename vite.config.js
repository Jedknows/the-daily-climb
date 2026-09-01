import { defineConfig } from 'vite'

// One client, two packaging targets (the doctrine from CRAZYGAMES-PLAN.md:
// the portal build is a packaging target, never a fork). `--mode portal`
// only flips VITE_PORTAL, which src/portal.js reads; every other byte of the
// bundle is identical between the two.
export default defineConfig(({ mode }) => ({
  base: './',
  define: {
    __PORTAL__: JSON.stringify(mode === 'portal' ? 'crazygames' : null),
  },
  build: {
    outDir: mode === 'portal' ? 'dist-portal' : 'dist',
    target: 'es2020',
    assetsInlineLimit: 8192,
  },
}))
