import { defineConfig } from "vite";

// "npm run build" makes a normal bundled app.
// "npm run build:artifact" keeps React external (loaded from cdnjs) and emits one
// IIFE script + one stylesheet that scripts/build-artifact.mjs inlines into a single page.
export default defineConfig(({ mode }) => ({
  base: "./",
  esbuild: { jsxFactory: "React.createElement", jsxFragment: "React.Fragment" },
  build:
    mode === "artifact"
      ? {
          outDir: "dist-artifact",
          cssCodeSplit: false,
          modulePreload: false,
          rollupOptions: {
            external: ["react", "react-dom", "react-dom/client"],
            output: {
              format: "iife",
              globals: { react: "React", "react-dom": "ReactDOM", "react-dom/client": "ReactDOM" },
              entryFileNames: "app.js",
              assetFileNames: "app.[ext]",
            },
          },
        }
      : {},
}));
