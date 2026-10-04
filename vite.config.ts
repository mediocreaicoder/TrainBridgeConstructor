import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import checker from 'vite-plugin-checker';

export default defineConfig({
  plugins: [
    react(),
    // Dev server only: runs tsc and ESLint in a worker and shows errors as an
    // in-browser overlay. `npm run build` already runs tsc and CI runs lint,
    // so the checks are skipped during `vite build`.
    checker({
      typescript: true,
      eslint: {
        lintCommand: 'eslint "./src/**/*.{ts,tsx}"',
        useFlatConfig: true,
      },
      enableBuild: false,
    }),
  ],
  // GitHub Pages serves the site from https://<user>.github.io/<repo>/,
  // so all asset URLs must be prefixed with the repo name.
  base: '/TrainBridgeConstructor/',
});
