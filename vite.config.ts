import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// 打包成单个 index.html（内联 JS/CSS），双击即可离线游玩
export default defineConfig({
  base: "./",
  plugins: [viteSingleFile()],
  build: {
    target: "es2022",
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    reportCompressedSize: false,
  },
  server: { port: 5173, open: false },
});
