import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import * as esbuild from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function electronDevPlugin(): Plugin {
  return {
    name: 'electron-dev',
    apply: 'serve',
    configureServer(server) {
      const isWebOnly =
        process.argv.includes('--web') ||
        process.argv.includes('--no-electron') ||
        process.env.NO_ELECTRON === 'true' ||
        process.env.WEB_ONLY === 'true';

      if (isWebOnly) {
        console.log('[electron-dev] Running in browser-only mode (--web or NO_ELECTRON detected).');
        return;
      }

      server.httpServer?.once('listening', async () => {
        const address = server.httpServer?.address();
        const port = typeof address === 'object' && address?.port ? address.port : 5173;
        const devServerUrl = `http://localhost:${port}`;

        const buildElectron = async () => {
          await esbuild.build({
            entryPoints: [
              path.resolve(__dirname, 'electron/main.ts'),
              path.resolve(__dirname, 'electron/preload.ts'),
            ],
            outdir: path.resolve(__dirname, 'dist-electron'),
            platform: 'node',
            format: 'cjs',
            bundle: true,
            external: ['electron', 'adm-zip'],
          });
        };

        try {
          console.log('\n[electron-dev] Compiling Electron main and preload scripts...');
          await buildElectron();
          console.log('[electron-dev] Electron build complete.');
        } catch (err) {
          console.error('[electron-dev] Failed to build Electron scripts:', err);
          return;
        }

        const electronMod = await import('electron');
        const electronBinary = (electronMod.default || electronMod) as unknown as string;

        let electronProc: ChildProcess | null = null;
        let isRestarting = false;

        const startElectron = () => {
          if (electronProc) {
            isRestarting = true;
            electronProc.removeAllListeners('exit');
            electronProc.kill();
            electronProc = null;
          }

          console.log(`[electron-dev] Launching Electron app (${devServerUrl})...`);
          electronProc = spawn(electronBinary, ['.'], {
            stdio: 'inherit',
            env: {
              ...process.env,
              VITE_DEV_SERVER_URL: devServerUrl,
            },
          });

          electronProc.on('exit', (code) => {
            electronProc = null;
            if (!isRestarting) {
              console.log('[electron-dev] Electron window closed. Exiting dev server...');
              server.close();
              process.exit(code || 0);
            }
            isRestarting = false;
          });
        };

        startElectron();

        // Watch electron/ directory for changes and automatically rebuild + restart
        const electronDir = path.resolve(__dirname, 'electron');
        server.watcher.add(electronDir);

        let debounceTimer: NodeJS.Timeout | null = null;
        server.watcher.on('change', (filePath) => {
          if (filePath.startsWith(electronDir)) {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(async () => {
              console.log(`\n[electron-dev] Detected change in ${path.basename(filePath)}. Recompiling...`);
              try {
                await buildElectron();
                console.log('[electron-dev] Restarting Electron app...');
                startElectron();
              } catch (err) {
                console.error('[electron-dev] Rebuild failed:', err);
              }
            }, 200);
          }
        });

        // Graceful termination
        const cleanup = () => {
          if (electronProc) {
            try {
              electronProc.kill();
            } catch {}
            electronProc = null;
          }
          process.exit(0);
        };

        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
        process.on('exit', cleanup);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), electronDevPlugin()],
  base: './',
  server: {
    port: 5173,
    strictPort: true,
  },
});
