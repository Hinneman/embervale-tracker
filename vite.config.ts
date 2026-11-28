import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  // Relative paths, so the build works under the GitHub Pages /<repo>/ path.
  base: "./",
  plugins: [preact(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        entryFileNames: "assets/scripts/[name]-[hash].js",
        chunkFileNames: "assets/scripts/[name]-[hash].js",
        assetFileNames: ({ names, originalFileNames }) => {
          const name = names[0] ?? "";
          if (originalFileNames.some((file) => file.includes("assets/tiles/"))) return "assets/tiles/[name]-[hash][extname]";
          if (/\.woff2?$/.test(name)) return "assets/fonts/[name]-[hash][extname]";
          if (name.endsWith(".css")) return "assets/styles/[name]-[hash][extname]";
          return "assets/images/[name]-[hash][extname]";
        },
      },
    },
  },
});
