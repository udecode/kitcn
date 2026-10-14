import { fileURLToPath } from 'node:url';

import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@convex': fileURLToPath(new URL('./convex/shared', import.meta.url)),
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
})
