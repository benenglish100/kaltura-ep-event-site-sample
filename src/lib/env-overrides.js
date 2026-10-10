// Node's --env-file never overrides variables already set in the environment. A terminal that
// pre-loaded an older .env (e.g. VS Code's python.terminal.useEnvFile) silently wins over later
// edits. This finds those keys so the server can warn about them.
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

export function findEnvOverrides(file = '.env', env = process.env) {
  let fromFile;
  try {
    fromFile = parseEnv(readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
  return Object.keys(fromFile).filter((key) => key in env && env[key] !== fromFile[key]);
}
