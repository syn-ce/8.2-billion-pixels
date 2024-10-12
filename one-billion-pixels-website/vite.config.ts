// Only used during development. For proxying in production, see nginx.conf.
import { defineConfig } from 'vite'

export default defineConfig({
    build: { target: 'esnext' },
    server: {
        host: true,
        port: 8000,
        proxy: {
            '/socket.io': {
                target: 'http://one-billion-pixels-flask-app-1:5000',
                ws: true,
                changeOrigin: true,
                secure: false,
            },
            '/api': {
                target: 'http://one-billion-pixels-flask-app-1:5000',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api/, ''),
                configure: (proxy, _options) => {
                    proxy.on('error', (err, _req, _res) => {
                        console.log('proxy error', err)
                    })
                    proxy.on('proxyReq', (proxyReq, req, _res) => {
                        console.log(
                            'Sending Request to the Target:',
                            req.method,
                            req.url
                        )
                    })
                    proxy.on('proxyRes', (proxyRes, req, _res) => {
                        console.log(
                            'Received Response from the Target:',
                            proxyRes.statusCode,
                            req.url
                        )
                    })
                },
            },
        },
    },
})
