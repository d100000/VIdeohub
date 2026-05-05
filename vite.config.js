import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

function formatBuildTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

const buildTimestamp = process.env.BUILD_TIMESTAMP || formatBuildTimestamp();
const versionedName = `assets/[name]-${buildTimestamp}-[hash]`;

export default defineConfig({
  plugins: [
    react(),
    {
      name: "frontend-asset-version",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "frontend-version.json",
          source: `${JSON.stringify({ version: buildTimestamp })}\n`,
        });
      },
    },
  ],
  define: {
    __FRONTEND_ASSET_VERSION__: JSON.stringify(buildTimestamp),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: `${versionedName}.js`,
        chunkFileNames: `${versionedName}.js`,
        assetFileNames: `${versionedName}[extname]`,
      },
    },
  },
});
