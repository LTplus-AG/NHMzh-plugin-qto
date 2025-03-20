import { defineConfig } from "vite";
import react from "@vitejs/plugin-react"; // Or whatever framework you're using

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 3004,
    strictPort: true,
    watch: {
      usePolling: true,
    },
    proxy: {
      "/api": {
        target: "http://qto-backend:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
