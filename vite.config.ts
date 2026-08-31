import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        entryFileNames: "assets/xgrowth-[hash].js",
        chunkFileNames: "assets/xgrowth-chunk-[hash].js",
        assetFileNames: "assets/xgrowth-[hash][extname]",
      },
    },
  },
});
