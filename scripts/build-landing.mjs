#!/usr/bin/env node
/**
 * Compile all .ts files in landing/ back to .js using esbuild.
 * Only compiles if .ts is newer than .js or .js is missing.
 * Run after editing any .ts source files.
 */

import { build } from 'esbuild';
import { readdirSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const DIRS = [
  join(root, 'landing'),
  join(root, 'landing', 'core'),
  join(root, 'landing', 'views'),
  join(root, 'landing', 'services'),
];

const WC_STACK_ENTRY = join(root, 'scripts', 'wizardconnect-stack-entry.ts');
const WC_STACK_OUT = join(root, 'landing', 'lib', 'wizardconnect-stack.js');

// Files that should NOT be compiled
// Files that need non-ESM output format (service workers, web workers)
const IIFE_FILES = new Set(['sw.ts', 'monero.worker.ts']);

let compiled = 0;
let skipped = 0;
const errors = [];

for (const dir of DIRS) {
  let files;
  try { files = readdirSync(dir); } catch { continue; }

  for (const file of files) {
    if (!file.endsWith('.ts')) continue;

    const tsPath = join(dir, file);
    const jsPath = tsPath.replace(/\.ts$/, '.js');

    // Skip if .js is newer than .ts
    if (existsSync(jsPath)) {
      const tsMtime = statSync(tsPath).mtimeMs;
      const jsMtime = statSync(jsPath).mtimeMs;
      if (jsMtime >= tsMtime) { skipped++; continue; }
    }

    try {
      await build({
        entryPoints: [tsPath],
        outfile: jsPath,
        format: 'esm',
        platform: 'browser',
        target: 'es2020',
        bundle: false,
        format: IIFE_FILES.has(file) ? 'iife' : 'esm',
        loader: { '.ts': 'ts' },
        logLevel: 'silent',
      });
      compiled++;
      process.stdout.write(`✓ ${file.replace('.ts', '')}\n`);
    } catch (err) {
      errors.push({ file, err });
      process.stderr.write(`✗ ${file}: ${err.message?.split('\n')[0]}\n`);
    }
  }
}

try {
  await build({
    entryPoints: [WC_STACK_ENTRY],
    outfile: WC_STACK_OUT,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'esnext',
    logLevel: 'silent',
  });
  compiled++;
  process.stdout.write('✓ wizardconnect-stack\n');
} catch (err) {
  errors.push({ file: 'wizardconnect-stack-entry.ts', err });
  process.stderr.write(`✗ wizardconnect-stack: ${err.message?.split('\n')[0]}\n`);
}

console.log(`\nCompiled: ${compiled}, Skipped: ${skipped}, Errors: ${errors.length}`);
if (errors.length > 0) process.exit(1);
