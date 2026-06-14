import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [tanstackStart(), tailwindcss(), react()],
})
