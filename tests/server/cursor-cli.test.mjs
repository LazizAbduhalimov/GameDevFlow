import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CursorCli, resolveCursorCommand } from '../../server/cursor-cli.mjs';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aMGQAAAAASUVORK5CYII=', 'base64');

async function fixture(t, model = 'success') {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'consept-cursor-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'reference.png');
  const output = path.join(directory, 'result.png');
  const imagePath = path.join(directory, 'native-assets', 'output.png');
  const releasePath = path.join(directory, 'release');
  const script = path.join(directory, 'fake-agent.mjs');
  await writeFile(source, Buffer.concat([png, Buffer.from('reference')]));
  await writeFile(script, `
    import { mkdir, readFile, writeFile } from 'node:fs/promises';
    import path from 'node:path';
    import { existsSync } from 'node:fs';
    const args = process.argv.slice(2);
    if (args.includes('status')) { console.log('Logged in'); process.exit(0); }
    const mode = args[args.indexOf('--model') + 1];
    if (mode === 'timeout') { setTimeout(() => {}, 10000); }
    else {
      if (mode === 'concurrent') {
        while (!existsSync(${JSON.stringify(releasePath)})) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      const emit = (event) => process.stdout.write(JSON.stringify(event) + '\\n');
      const request = await readFile('request.txt', 'utf8');
      if (!request.includes('native')) throw new Error('Missing instructions');
      emit({ type: 'tool_call', tool_call: { readToolCall: { result: { success: { content: request } } } } });
      if (mode !== 'text-only') {
        emit({ type: 'tool_call', subtype: 'started', tool_call: { generateImageToolCall: { args: {} } } });
        if (mode === 'tool-error') {
          emit({ type: 'tool_call', subtype: 'completed', tool_call: { generateImageToolCall: { result: { error: { message: 'Image quota exceeded' } } } } });
        } else {
          await mkdir(${JSON.stringify(path.dirname(imagePath))}, { recursive: true });
          await writeFile(${JSON.stringify(imagePath)}, mode === 'copy' ? await readFile('references/1.png') : Buffer.from(${JSON.stringify(png.toString('base64'))}, 'base64'));
          emit({ type: 'tool_call', subtype: 'completed', tool_call: { generateImageToolCall: { result: { success: { filePath: ${JSON.stringify(imagePath)} } } } } });
        }
      }
      emit({ type: 'result', is_error: false, result: 'Finished' });
    }
  `);
  const cli = new CursorCli({ command: { command: process.execPath, args: [script] }, model, timeoutMs: model === 'timeout' ? 150 : 5000 });
  return { cli, source, output, directory, releasePath };
}

test('Cursor saves native tool images returned outside the workspace', async (t) => {
  const { cli, source, output } = await fixture(t);
  assert.equal((await cli.status()).available, true);
  const result = await cli.generate({ sourcePaths: [source], outputPath: output, prompt: 'A yellow plug' });
  assert.deepEqual(await readFile(output), png);
  assert.equal(result.transparentBackground, true);
  assert.equal(cli.children.size, 0);
});

test('Cursor rejects text-only results even if read text mentions generateImage', async (t) => {
  const { cli, source, output } = await fixture(t, 'text-only');
  await assert.rejects(cli.generate({ sourcePaths: [source], outputPath: output, prompt: 'generateImage' }), /Finished|without invoking/);
});

test('Cursor reports native image tool errors', async (t) => {
  const { cli, source, output } = await fixture(t, 'tool-error');
  await assert.rejects(cli.generate({ sourcePaths: [source], outputPath: output, prompt: 'An icon' }), /quota exceeded/);
});

test('Cursor rejects reference copies as generated assets', async (t) => {
  const { cli, source, output } = await fixture(t, 'copy');
  await assert.rejects(cli.generate({ sourcePaths: [source], outputPath: output, prompt: 'An icon' }), /without a generated raster/);
});

test('Cursor times out instead of leaving jobs running indefinitely', async (t) => {
  const { cli, source, output } = await fixture(t, 'timeout');
  await assert.rejects(cli.generate({ sourcePaths: [source], outputPath: output, prompt: 'An icon' }), /timed out/);
});

test('Windows resolution prefers the newest complete bundled runtime', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'consept-cursor-command-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const version of ['2026.9.9-aaaa', '2026.10.1-bbbb', '2026.10.2-cccc']) {
    const runtime = path.join(directory, 'cursor-agent', 'versions', version);
    await mkdir(runtime, { recursive: true });
    if (version.endsWith('cccc')) continue;
    await writeFile(path.join(runtime, 'node.exe'), '');
    await writeFile(path.join(runtime, 'index.js'), '');
  }
  const resolved = resolveCursorCommand({ platform: 'win32', env: { LOCALAPPDATA: directory } });
  assert.match(resolved.command, /2026\.10\.1-bbbb/);
  assert.equal(resolved.args.length, 1);
});

test('six Cursor images each launch their own CLI process concurrently', async (t) => {
  const { cli, source, directory, releasePath } = await fixture(t, 'concurrent');
  const outputs = Array.from({ length: 6 }, (_, index) => path.join(directory, `result-${index}.png`));
  const runs = outputs.map((outputPath) => cli.generate({ sourcePaths: [source], outputPath, prompt: 'An icon' }));
  const deadline = Date.now() + 3000;
  while (cli.children.size < 6 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
  const childCount = cli.children.size;
  const processCount = new Set([...cli.children].map((child) => child.pid)).size;
  await writeFile(releasePath, 'ready');
  await Promise.all(runs);
  assert.equal(childCount, 6);
  assert.equal(processCount, 6);
  for (const output of outputs) assert.deepEqual(await readFile(output), png);
  assert.equal(cli.children.size, 0);
});
