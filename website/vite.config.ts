// Only used during development. For proxying in production, see nginx.conf.
import { defineConfig } from 'vite'

export default defineConfig({
    build: { target: 'esnext' },
    server: {
        host: true,
        port: 8000,
    },
})
