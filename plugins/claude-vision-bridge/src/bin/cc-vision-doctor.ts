#!/usr/bin/env node
import { loadConfig } from '../config/load-config.js';
import { sanitizeDoctorOutput } from '../mcp/server.js';
import { buildProviders } from '../providers/registry.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const providers = buildProviders(config);
  const health = [];

  for (const provider of providers) {
    health.push(await provider.healthCheck());
  }

  process.stdout.write(
    `${JSON.stringify(
      sanitizeDoctorOutput({
        version: '0.1.5',
        providerOrder: config.providerOrder,
        remoteFallback: config.allowRemoteFallback,
        pluginDataDir: config.pluginDataDir,
        providers: config.providers,
        health,
      }),
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
