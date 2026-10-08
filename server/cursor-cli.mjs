import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { detectRasterImage, hasPngTransparency } from './image-validation.mjs';

// Use the bundled Node directly on Windows: .cmd shims cannot be spawned
// without a shell, and a shell would reinterpret image prompts and paths.
export function resolveCursorCommand({ env = process.env, platform = process.platform } = {}) {
  const override = env.CONSEPT_CURSOR_COMMAND || env.FRAMEFORGE_CURSOR_COMMAND;
  if (override) return { command: override, args: [] };
  if (platform === 'win32') {
    const base = path.join(env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'cursor-agent');
    const versions = path.join(base, 'versions');
    if (existsSync(versions)) {
      const names = readdirSync(versions).filter((name) => /^\d{4}\.\d{1,2}\.\d{1,2}(-\d{2}-\d{2}-\d{2})?-[a-f0-9]+$/.test(name))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      for (const name of names) {
        const directory = path.join(versions, name);
        if (existsSync(path.join(directory, 'node.exe')) && existsSync(path.join(directory, 'index.js'))) {
          return { command: path.join(directory, 'node.exe'), args: [path.join(directory, 'index.js')] };
        }
      }
    }
    const launcher = path.join(base, 'cursor-agent.ps1');
    if (existsSync(launcher)) return { command: 'powershell.exe', args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', launcher] };
  }
  return { command: 'cursor-agent', args: [] };
}

export class CursorCli {
  constructor({ command = resolveCursorCommand(), spawnProcess = spawn, timeoutMs = 6 * 60_000, model = process.env.CONSEPT_CURSOR_MODEL || process.env.FRAMEFORGE_CURSOR_MODEL || 'auto' } = {}) {
    this.command = command;
    this.spawnProcess = spawnProcess;
    this.timeoutMs = timeoutMs;
    this.model = model;
    this.children = new Set();
  }

  async status() {
    const result = await this.run(['status'], { timeoutMs: 10_000 });
    const combined = `${result.stdout}\n${result.stderr}`.replace(/\x1b\[[0-9;]*m/g, '').trim();
    const installed = result.code !== null && !result.spawnError;
    const connected = result.code === 0 && /logged in/i.test(combined) && !/not logged in/i.test(combined);
    return {
      id: 'cursor', label: 'Cursor ImageGen', installed, connected, available: installed && connected,
      reason: installed && connected ? undefined : installed ? 'Sign in with agent login in a terminal, then refresh.' : 'Cursor Agent CLI is unavailable. Install it or configure CONSEPT_CURSOR_COMMAND.',
      capabilities: { imageGeneration: true, imageEditing: true, cancellation: 'queued-only', workerMode: 'per-image', maxConcurrency: null },
    };
  }

  stopChild(child) {
    if (process.platform === 'win32' && child.pid) {
      const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
      killer.on('error', () => child.kill());
    } else child.kill();
  }

  stop() { for (const child of this.children) this.stopChild(child); }

  run(args, { cwd, timeoutMs = this.timeoutMs, onEvent } = {}) {
    return new Promise((resolve) => {
      let stdout = ''; let stderr = ''; let buffer = ''; let settled = false; let timedOut = false; let killTimeout;
      const child = this.spawnProcess(this.command.command, [...this.command.args, ...args], { cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      this.children.add(child);
      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        clearTimeout(killTimeout);
        this.children.delete(child);
        resolve({ stdout, stderr, ...result });
      };
      const timeout = setTimeout(() => {
        timedOut = true;
        this.stopChild(child);
        // Wait for close before deleting the workspace (Windows locks cwd).
        killTimeout = setTimeout(() => finish({ code: null, spawnError: 'Cursor CLI timed out.' }), 5000);
      }, timeoutMs);
      child.stdout.on('data', (chunk) => {
        const value = chunk.toString();
        stdout = (stdout + value).slice(-64_000);
        if (!onEvent) return;
        buffer += value;
        let newline;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
          let event;
          try { event = JSON.parse(line); } catch { continue; }
          onEvent(event);
        }
      });
      child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-8_000); });
      child.once('error', (error) => finish({ code: null, spawnError: error.message }));
      child.once('close', (code) => finish({ code: timedOut ? null : code, spawnError: timedOut ? 'Cursor CLI timed out.' : null }));
    });
  }

  async generate({ sourcePaths, outputPath, prompt, requireTransparentBackground = false, onProgress = () => {} }) {
    if (!sourcePaths?.length) throw new Error('At least one local reference image is required.');
    const workspace = await mkdtemp(path.join(os.tmpdir(), 'consept-cursor-'));
    try {
      const references = path.join(workspace, 'references');
      await mkdir(references);
      const localPaths = await Promise.all(sourcePaths.map(async (source, index) => {
        const target = path.join(references, `${index + 1}${path.extname(source) || '.png'}`);
        await copyFile(source, target);
        return target;
      }));
      await writeFile(path.join(workspace, 'request.txt'), [
        'You are an image generation engine. Use the native generate_image / generateImage tool to generate exactly one raster image. Read the reference images and pass them to the image tool as referenceImagePaths.',
        'Do not write code, draw with SVG/canvas/Python, use other providers, or just copy a reference. If the native image tool is unavailable, report the limitation and stop.',
        'Use filename output.png for the image tool. Do not modify the references. Return the generated image path.',
        requireTransparentBackground ? 'Request real PNG alpha transparency outside the asset; never simulate it with a checkerboard.' : '',
        `Reference image paths:\n${localPaths.join('\n')}`,
        prompt,
      ].filter(Boolean).join('\n\n'));
      onProgress('Cursor is preparing image generation');
      let imageToolUsed = false;
      let providerError = '';
      let imagePath = '';
      let resultFailed = false;
      const result = await this.run([
        '-p', '--trust', '--force', '--workspace', workspace, '--model', this.model, '--output-format', 'stream-json',
        'Read request.txt in this workspace and perform the image generation request with the native image tool. Return the generated image file path.',
      ], { cwd: workspace, onEvent: (event) => {
        const imageCall = event.tool_call?.generateImageToolCall;
        if (imageCall) {
          imageToolUsed = true;
          if (event.subtype === 'started') onProgress('Cursor ImageGen is rendering');
          const toolResult = imageCall.result;
          if (toolResult?.success?.filePath) imagePath = toolResult.success.filePath;
          if (toolResult?.error) providerError = typeof toolResult.error === 'string' ? toolResult.error : JSON.stringify(toolResult.error);
        }
        if (event.type === 'result') {
          resultFailed = Boolean(event.is_error);
          if (resultFailed) providerError = String(event.result || 'Cursor image generation failed.');
          else if (!imagePath && !providerError) providerError = String(event.result || '');
        }
      } });
      if (result.code !== 0 || resultFailed || providerError && !imagePath) {
        throw new Error(result.spawnError || providerError.slice(0, 800) || result.stderr.trim() || 'Cursor image generation failed.');
      }
      if (!imageToolUsed) throw new Error('Cursor finished without invoking its native image generation tool.');
      const candidates = await findImages(workspace, references);
      if (imagePath) candidates.unshift(path.resolve(workspace, imagePath));
      candidates.sort((a, b) => Number(path.basename(b) === 'output.png') - Number(path.basename(a) === 'output.png'));
      const referenceBytes = await Promise.all(localPaths.map((reference) => readFile(reference)));
      for (const candidate of candidates) {
        if (!existsSync(candidate)) continue;
        const bytes = await readFile(candidate);
        if (!detectRasterImage(bytes)) continue;
        // Do not publish an unchanged reference as a generated result.
        if (referenceBytes.some((reference) => reference.equals(bytes))) continue;
        await copyFile(candidate, outputPath);
        onProgress('Saving Cursor image');
        return { outputPath, transparentBackground: hasPngTransparency(bytes) };
      }
      throw new Error('Cursor finished without a generated raster image. Native image generation may be unavailable for this account or model.');
    } finally {
      await rm(workspace, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 });
    }
  }
}

async function findImages(directory, references, depth = 0) {
  if (depth > 5) return [];
  const images = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (filename === references || entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) images.push(...await findImages(filename, references, depth + 1));
    else if (entry.isFile() && /\.(png|jpe?g|webp|gif|bmp)$/i.test(entry.name)) images.push(filename);
  }
  return images;
}
