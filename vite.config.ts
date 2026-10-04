import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves the site from https://<user>.github.io/<repo>/,
  // so all asset URLs must be prefixed with the repo name.
  base: '/TrainBridgeConstructor/',
});
