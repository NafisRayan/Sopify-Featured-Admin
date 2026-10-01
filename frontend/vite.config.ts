import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    build: {
        chunkSizeWarningLimit: 900,
    },
    server: {
        allowedHosts: true,
        proxy: {
            "/api": {
                target: "http://localhost:4000",
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api/, ""),
                configure: (proxy) => {
                    proxy.on("proxyReq", (proxyRequest) => {
                        proxyRequest.removeHeader("origin");
                    });
                },
            },
        },
    },
});