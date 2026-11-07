import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Relative base: the build works at username.github.io/<any-repo-name>/ with no config.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: { environment: 'happy-dom', include: ['tests/**/*.test.ts'] },
});
