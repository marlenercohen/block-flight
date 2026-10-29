import { execSync } from 'node:child_process';
// Build identifier for the logs (git short hash, '-dirty' if uncommitted changes exist).
let version = 'unknown';
try { version = execSync('git rev-parse --short HEAD').toString().trim() + (execSync('git status --porcelain').toString().trim() ? '-dirty' : ''); } catch { /* not a git checkout */ }
// Production builds are served by GitHub Pages at https://marlenercohen.github.io/block-flight/ (override with VITE_BASE). Dev server: base '/', port 5175.
export default ({ command }) => ({
  define: { __APP_VERSION__: JSON.stringify(version) },
  base: command === 'build' ? (process.env.VITE_BASE ?? '/block-flight/') : '/',
  server: { port: 5175 },
  build: { target: 'esnext', chunkSizeWarningLimit: 6000 },
});
