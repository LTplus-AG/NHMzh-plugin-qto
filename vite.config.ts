import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import federation from "@originjs/vite-plugin-federation";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load environment variables
  const env = loadEnv(mode, process.cwd(), "");

  // Default to localhost:8000 if API_URL is not defined
  const apiUrl = env.API_URL || "http://localhost:8000";
  console.log(`Using API URL: ${apiUrl}`);

  return {
    plugins: [
      react(),
      federation({
        name: "plugin-qto",
        filename: "remoteEntry.js",
        exposes: {
          "./App": "./src/App.tsx",
        },
        shared: ["react", "react-dom", "react-router-dom"],
      }),
    ],
    define: {
      // Expose environment variables to the client
      "import.meta.env.VITE_API_URL": JSON.stringify(apiUrl),
    },
    build: {
      target: "esnext",
      minify: false,
      rollupOptions: {
        output: {
          format: "esm",
          entryFileNames: "assets/[name].js",
          chunkFileNames: "assets/[name].js",
          assetFileNames: "assets/[name].[ext]",
        },
      },
    },
    preview: {
      port: 3004,
      strictPort: true,
    },
    server: {
      port: 3004,
      strictPort: true,
      host: true,
      proxy: {
        "/api": {
          target: apiUrl,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
          secure: false,
          configure: (proxy, _options) => {
            proxy.on("error", (err, _req, _res) => {
              console.log("proxy error", err);
            });
            proxy.on("proxyReq", (_proxyReq, req, _res) => {
              console.log(
                "Sending Request to the Target:",
                req.method,
                req.url
              );
            });
            proxy.on("proxyRes", (proxyRes, req, _res) => {
              console.log(
                "Received Response from the Target:",
                proxyRes.statusCode,
                req.url
              );
            });
          },
        },
      },
    },
  };
});
