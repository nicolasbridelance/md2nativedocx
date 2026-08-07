import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  label: 'md2nativedocx',
  files: 'dist-test/test/suite/**/*.test.js',
  workspaceFolder: './test/fixtures',
  mocha: {
    timeout: 30000,
  },
});
