/**
 * CLI helper for EffectCraft automation scripts.
 *
 * Wraps child_process.spawnSync so other scripts in this folder can invoke the
 * EffectCraft CLI with a consistent interface, logging, and error handling.
 *
 * Usage:
 *   const cli = require('./cli-helper');
 *   const result = await cli.run('cli', 'effectcraft', 'comp.new', '--name', 'Test');
 *   if (!result.ok) process.exit(1);
 */

const { spawnSync } = require('child_process');
const { join, dirname } = require('path');
const { fileURLToPath } = require('url');

// Resolve the project root relative to this file so the CLI path stays stable.
const __filename = fileURLToPath(__filename);
const __dirname = dirname(__filename);
const CLI_PATH = join(__dirname, '..', '.artcraft', 'artcraft.mjs');

/**
 * Run the EffectCraft CLI with the given arguments.
 *
 * @param {string[]} args - CLI arguments, not including the node + CLI path.
 * @param {object} [opts] - spawnSync-style options (stdio, timeout, env, etc.).
 * @returns {{ ok: boolean, stdout: string, stderr: string, status: number|null }}
 */
function run(...args) {
  const options = typeof args[args.length - 1] === 'object' ? args.pop() : {};
  const stdio = options.stdio ?? 'pipe';

  const command = ['node', CLI_PATH, ...args];
  const result = spawnSync('node', command, {
    stdio,
    encoding: 'utf8',
    windowsHide: true,
    ...options,
  });

  const ok = result.status === 0;
  if (!ok) {
    console.error('[cli-error]', command.join(' '));
    if (result.stderr) console.error(result.stderr.trim());
  }

  return {
    ok,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status,
  };
}

/**
 * Run a CLI command and throw if it fails.
 *
 * @param {string[]} args
 * @param {object} [opts]
 * @returns {string} stdout
 */
function runOrThrow(...args) {
  const options = typeof args[args.length - 1] === 'object' ? args.pop() : {};
  const result = run(...args, options);
  if (!result.ok) {
    throw new Error(`CLI failed: ${args.join(' ')}`);
  }
  return result.stdout;
}

/**
 * Print a CLI command without running it (useful for dry runs / debugging).
 *
 * @param {string[]} args
 */
function explain(...args) {
  console.log('[cli]', CLI_PATH, ...args);
}

module.exports = { run, runOrThrow, explain, CLI_PATH };
