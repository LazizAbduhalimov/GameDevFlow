import { existsSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const executableName = process.platform === 'win32' ? 'codex.exe' : 'codex';

export function resolveCodexCommand() {
  const fromEnv = typeof process.env.CODEX_CLI_PATH === 'string' ? process.env.CODEX_CLI_PATH.trim() : '';
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const binDir = path.join(localAppData, 'OpenAI', 'Codex', 'bin');
  const candidates = [];

  if (existsSync(binDir)) {
    const rootExecutable = path.join(binDir, executableName);
    if (existsSync(rootExecutable)) candidates.push(rootExecutable);
    for (const entry of readdirSync(binDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const nested = path.join(binDir, entry.name, executableName);
      if (existsSync(nested)) candidates.push(nested);
    }
  }

  if (candidates.length) {
    candidates.sort((left, right) => mtime(right) - mtime(left));
    return candidates[0];
  }

  return executableName;
}

export function codexSpawnEnv(extra = {}) {
  const command = resolveCodexCommand();
  const currentPath = process.env.PATH || process.env.Path || '';
  const commandDir = path.isAbsolute(command) ? path.dirname(command) : '';
  const pathParts = currentPath.split(path.delimiter).filter(Boolean);
  const nextPath = commandDir && !pathParts.some((part) => path.resolve(part) === path.resolve(commandDir))
    ? [commandDir, ...pathParts].join(path.delimiter)
    : currentPath;
  return { ...process.env, ...extra, PATH: nextPath, NO_COLOR: extra.NO_COLOR || '1' };
}

function mtime(filePath) {
  try { return statSync(filePath).mtimeMs; }
  catch { return 0; }
}
