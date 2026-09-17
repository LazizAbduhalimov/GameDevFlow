import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveCodexCommand } from '../../server/codex-command.mjs';

test('resolveCodexCommand prefers CODEX_CLI_PATH when the file exists', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'frameforge-codex-'));
  const executable = path.join(directory, process.platform === 'win32' ? 'codex.exe' : 'codex');
  await writeFile(executable, '');
  const previous = process.env.CODEX_CLI_PATH;
  process.env.CODEX_CLI_PATH = executable;
  try {
    assert.equal(resolveCodexCommand(), executable);
  } finally {
    if (previous === undefined) delete process.env.CODEX_CLI_PATH;
    else process.env.CODEX_CLI_PATH = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
