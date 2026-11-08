import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  base: "./",
  // The globe build must not copy public/ (the assembled deployment payload)
  // into globe-dist/; that produced ~700 KB of duplicate assets per build.
  publicDir: false,
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": root,
    },
  },
  build: {
    outDir: "globe-dist",
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: fileURLToPath(new URL("./globe/main.tsx", import.meta.url)),
      name: "TimbreGlobe",
      formats: ["iife"],
      fileName: () => "globe-island.js",
    },
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) =>
          assetInfo.name?.endsWith(".css") ? "globe-island.css" : "assets/[name][extname]",
      },
    },
  },
});
