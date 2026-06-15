import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { build } from 'esbuild';

const entries = [
  { entry: 'src/hook/handler.ts', outfile: 'dist/hook-handler.js' },
  { entry: 'src/mcp/server.ts', outfile: 'dist/mcp-server.js' },
  { entry: 'src/bin/cc-vision-doctor.ts', outfile: 'dist/bin/cc-vision-doctor.js' },
];

for (const item of entries) {
  mkdirSync(dirname(item.outfile), { recursive: true });
  await build({
    entryPoints: [item.entry],
    outfile: item.outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    sourcemap: false,
    logLevel: 'silent',
  });
  chmodSync(item.outfile, 0o755);
}
