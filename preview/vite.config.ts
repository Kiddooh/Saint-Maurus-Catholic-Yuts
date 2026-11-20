import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react(), {
    name: 'version-service-worker', apply: 'build',
    writeBundle(options) {
      const out = resolve(options.dir || 'dist');
      const digest = createHash('sha256');
      const visit = (dir: string) => { for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) { const file = resolve(dir, entry.name); if (entry.isDirectory()) visit(file); else if (file !== resolve(out, 'sw.js')) { digest.update(file.slice(out.length)); digest.update(readFileSync(file)); } } };
      visit(out);
      const sw = resolve(out, 'sw.js');
      writeFileSync(sw, readFileSync(sw, 'utf8') + '\n// build ' + digest.digest('hex') + '\n');
    }
  }, {
    name: 'block-legacy-document-files',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        try {
          const pathname = decodeURIComponent(new URL(req.url || '/', 'http://local').pathname);
          if (/^\/documents\/.+/i.test(pathname)) { res.statusCode = 404; res.end('Not found'); return; }
        } catch { res.statusCode = 400; res.end('Bad request'); return; }
        next();
      });
    }
  }],
  server: { host: '0.0.0.0', allowedHosts: true, proxy: { '/api': { target: 'http://127.0.0.1:4000', changeOrigin: false }, '/socket.io': { target: 'http://127.0.0.1:4000', changeOrigin: false, ws: true } } }
});
