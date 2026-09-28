const fs = require('fs');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
module.exports = {
  testDir: './tests', testMatch: '**/*.spec.js', timeout: 45000, workers: 1,
  webServer: { command: 'npm run dev', url: 'http://localhost:3000/health', reuseExistingServer: !process.env.CI },
  use: { browserName: 'chromium', launchOptions: { ...(fs.existsSync(edge) ? { executablePath: edge } : {}), args: ['--enable-webgl', '--ignore-gpu-blocklist'] }, viewport: { width: 1440, height: 1050 } },
  reporter: 'list'
};
