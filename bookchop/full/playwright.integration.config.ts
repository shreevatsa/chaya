import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

export default defineConfig({
    testDir: './tests/integration',
    timeout: 30_000,
    workers: 2,
    reporter: 'list',
    use: {
        ...devices['Desktop Chrome'],
        channel: process.env.PLAYWRIGHT_CHANNEL,
        baseURL: 'http://127.0.0.1:8765',
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
    },
    webServer: {
        command: 'python3 -m http.server 8765 --bind 127.0.0.1',
        cwd: path.resolve(__dirname, '../..'),
        port: 8765,
        reuseExistingServer: false,
        stdout: 'ignore',
        stderr: 'ignore',
    },
});
