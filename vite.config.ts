import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { transformFileCompatibleHtml } from './src/test/fileCompatibleHtml';

function fileCompatibleHtmlPlugin(): Plugin {
  return {
    name: 'file-compatible-html',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler: transformFileCompatibleHtml,
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), fileCompatibleHtmlPlugin()],
  build: {
    modulePreload: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    css: true,
  },
});
