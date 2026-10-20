import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'stub-useasync',
      enforce: 'pre',
      resolveId(source) {
        if (/(^|\/)useAsync(\.ts)?$/.test(source)) return path.resolve('smoke-useasync-stub.ts');
        return null;
      },
    },
  ],
});
