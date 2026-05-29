import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      // null = sem file watchers (evita ENOSPC no Linux)
      watch:
        process.env.DISABLE_HMR === 'true'
          ? null
          : {
              ignored: [
                '**/node_modules/**',
                '**/dist/**',
                '**/.git/**',
                '**/db.json',
                '**/.cursor/**',
              ],
              // Se ainda der ENOSPC: VITE_USE_POLLING=true npm run dev
              usePolling: process.env.VITE_USE_POLLING === 'true',
            },
    },
  };
});
