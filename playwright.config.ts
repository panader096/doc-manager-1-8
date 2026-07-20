import { defineConfig } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// Playwright doesn't auto-load .env.local the way Next.js does -- read it
// manually so e2e/ tests can pull E2E_TEST_EMAIL/E2E_TEST_PASSWORD from the
// same gitignored file rather than hardcoding credentials in source.
function loadEnvLocal() {
  const envPath = path.resolve(__dirname, '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    if (!process.env[key.trim()]) process.env[key.trim()] = value.trim();
  }
}
loadEnvLocal();

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:3000',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
