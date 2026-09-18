import { spawn } from 'node:child_process';
import { copyFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { codexSpawnEnv, resolveCodexCommand } from './codex-command.mjs';

const codexCommand = resolveCodexCommand();

export class CodexAppServer extends EventEmitter {
  #child = null;
  #buffer = '';
  #nextId = 1;
  #pending = new Map();
  #starting = null;

  get running() { return Boolean(this.#child && !this.#child.killed); }

  async start(cwd) {
    if (this.#child && !this.#child.killed) return;
    if (this.#starting) return this.#starting;

    this.#starting = new Promise((resolve, reject) => {
      const child = spawn(codexCommand, [
        'app-server',
        '--stdio',
        '-c',
        'mcp_servers.unityMCP.enabled=false',
      ], {
        cwd,
        shell: false,
        windowsHide: true,
        env: codexSpawnEnv(),
      });
      this.#child = child;

      child.stdout.on('data', (chunk) => this.#read(chunk));
      child.stderr.on('data', (chunk) => this.emit('diagnostic', chunk.toString().trim()));
      child.on('error', reject);
      child.on('close', (code) => {
        const error = new Error(`Codex app-server stopped with code ${code}.`);
        for (const { reject: rejectRequest } of this.#pending.values()) rejectRequest(error);
        this.#pending.clear();
        this.#child = null;
        this.emit('closed', error);
      });

      this.request('initialize', {
        clientInfo: { name: 'consept-local', title: 'Consept Local Image Lab', version: '0.1.0' },
        capabilities: {
          experimentalApi: true,
          requestAttestation: false,
          extensions: {},
        },
      }).then(() => {
        this.notify('initialized', {});
        resolve();
      }).catch(reject);
    }).finally(() => { this.#starting = null; });

    return this.#starting;
  }

  request(method, params) {
    if (!this.#child?.stdin.writable) return Promise.reject(new Error('Codex app-server is not running.'));
    const id = this.#nextId++;
    this.#write({ id, method, params });
    return new Promise((resolve, reject) => this.#pending.set(id, { resolve, reject }));
  }

  notify(method, params) {
    this.#write({ method, params });
  }

  stop() {
    if (this.#child && !this.#child.killed) this.#child.kill();
    this.#child = null;
  }

  async generate({ cwd, sourcePath, sourcePaths, outputPath, prompt, onProgress, requireTransparentBackground = false }) {
    await this.start(cwd);
    onProgress('Opening an ImageGen session');
    const references = (Array.isArray(sourcePaths) ? sourcePaths : [sourcePath]).filter(Boolean);
    if (!references.length) throw new Error('At least one local reference image is required.');

    const threadResponse = await this.request('thread/start', {
      cwd,
      runtimeWorkspaceRoots: [cwd],
      approvalPolicy: 'never',
      sandbox: 'workspace-write',
      ephemeral: true,
      serviceName: 'Consept',
      baseInstructions: [
        'You are the image generation engine for a local node-based art tool. Use image generation whenever the user requests a visual result. Do not write application code.',
        requireTransparentBackground ? 'This request requires a native transparent background. Invoke image generation with its transparent-background option enabled; do not render or imitate a checkerboard. The returned PNG must have real alpha outside the asset.' : '',
      ].filter(Boolean).join(' '),
    });
    const threadId = threadResponse.thread.id;

    return new Promise(async (resolve, reject) => {
      let imageReceived = false;
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.off('notification', handleNotification);
        callback(value);
      };

      const handleNotification = async (message) => {
        const notificationThreadId = message.params?.threadId;
        if (notificationThreadId && notificationThreadId !== threadId) return;

        if (message.method === 'item/started') {
          const type = message.params?.item?.type;
          onProgress(type === 'imageGeneration' ? 'ImageGen is rendering' : 'Codex is preparing the image');
        }

        if (message.method === 'item/completed' && message.params?.item?.type === 'imageGeneration') {
          try {
            const item = message.params.item;
            if (item.failure) throw new Error(item.failure.type === 'usageLimitExceeded' ? 'Image generation usage limit exceeded.' : 'Image generation failed.');
            if (requireTransparentBackground && item.transparentBackground !== true) throw new Error('ImageGen returned an opaque background instead of native alpha transparency. No sprite was saved; retry the generation.');
            if (item.savedPath && existsSync(item.savedPath)) {
              await copyFile(item.savedPath, outputPath);
            } else if (item.result) {
              const encoded = item.result.includes(',') ? item.result.slice(item.result.indexOf(',') + 1) : item.result;
              await writeFile(outputPath, Buffer.from(encoded, 'base64'));
            }
            imageReceived = existsSync(outputPath);
            if (imageReceived) onProgress('Saving generated image');
          } catch (error) {
            finish(reject, error);
          }
        }

        if (message.method === 'error') {
          finish(reject, new Error(message.params?.message || 'Codex app-server reported an error.'));
        }

        if (message.method === 'turn/completed') {
          if (imageReceived || existsSync(outputPath)) finish(resolve, { outputPath, transparentBackground: requireTransparentBackground ? true : null });
          else finish(reject, new Error('Codex finished without an image result. Image generation may be unavailable for this account or model.'));
        }
      };

      const timeout = setTimeout(() => {
        finish(reject, new Error('ImageGen did not complete within 6 minutes.'));
      }, 6 * 60 * 1000);

      this.on('notification', handleNotification);
      try {
        await this.request('turn/start', {
          threadId,
          input: [
            { type: 'text', text: prompt },
            ...references.map((referencePath) => ({ type: 'localImage', path: referencePath, detail: 'original' })),
          ],
          effort: 'low',
          approvalPolicy: 'never',
        });
        onProgress('Request accepted by Codex');
      } catch (error) {
        finish(reject, error);
      }
    });
  }

  async enhancePrompt({ cwd, prompt, context = 'image-generation' }) {
    await this.start(cwd);
    const contextInstructions = {
      'image-generation': 'Make composition, camera, lighting, materials, background, and preservation constraints explicit where they help.',
      'multi-variation': 'Describe shared constraints and useful variation axes. The result must request one image per run, never a contact sheet or several options in one image.',
      'character-consistency': 'Prioritize exact identity, outfit, proportions, materials, accessories, and consistency across orthographic character views.',
    };
    const threadResponse = await this.request('thread/start', {
      cwd,
      runtimeWorkspaceRoots: [cwd],
      approvalPolicy: 'never',
      sandbox: 'read-only',
      ephemeral: true,
      serviceName: 'Consept Prompt Enhance',
      baseInstructions: [
        'You are a prompt editor inside a local image-generation tool.',
        'Rewrite the user draft into one precise, production-ready image-generation prompt.',
        'Preserve the original intent and every concrete requirement. Do not invent a different subject, style, or deliverable.',
        'Return only the improved prompt as plain text: no title, explanation, bullets, quotes, or markdown fences.',
      ].join(' '),
    });
    const threadId = threadResponse.thread.id;

    return new Promise(async (resolve, reject) => {
      let text = '';
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.off('notification', handleNotification);
        callback(value);
      };

      const handleNotification = (message) => {
        const notificationThreadId = message.params?.threadId;
        if (notificationThreadId && notificationThreadId !== threadId) return;
        if (message.method === 'item/agentMessage/delta') text += message.params?.delta || '';
        if (message.method === 'item/completed' && message.params?.item?.type === 'agentMessage') text = message.params.item.text || text;
        if (message.method === 'error') finish(reject, new Error(message.params?.message || 'Codex could not enhance the prompt.'));
        if (message.method === 'turn/completed') {
          const enhanced = cleanPromptText(text);
          if (enhanced) finish(resolve, enhanced);
          else finish(reject, new Error('Codex finished without an enhanced prompt.'));
        }
      };

      const timeout = setTimeout(() => finish(reject, new Error('Prompt enhancement did not complete within 90 seconds.')), 90_000);
      this.on('notification', handleNotification);
      try {
        await this.request('turn/start', {
          threadId,
          input: [{
            type: 'text',
            text: `${contextInstructions[context] || contextInstructions['image-generation']}\n\nDraft prompt:\n${prompt}`,
          }],
          effort: 'low',
          approvalPolicy: 'never',
        });
      } catch (error) {
        finish(reject, error);
      }
    });
  }

  async analyzeCharacterProps({ cwd, imagePaths = [], userHint = '', outputSchema }) {
    const paths = Array.isArray(imagePaths) ? imagePaths.filter(Boolean) : [];
    const viewHint = paths.length === 4
      ? 'These four images are front, back, left and right views of the same character. Propose one unified list of extractable parts, not a duplicate list per view.'
      : 'Inspect this character image and propose extractable parts and wearable props.';
    const prompt = [
      'Identify distinct character parts and wearable props that can be isolated as standalone 4-view assets.',
      viewHint,
      'Prefer concrete visible items: head, hair, armor plates, belts, gloves, boots, weapons, pouches, or unique accessories.',
      'Use short human-readable names. Do not merge left and right copies unless they are clearly one object. Ignore the studio background.',
      userHint ? `User guidance: ${userHint}` : '',
    ].filter(Boolean).join('\n');
    return this.#runStructuredTurn({
      cwd,
      serviceName: 'Consept Props Extraction',
      baseInstructions: 'You detect extractable character parts and props. Return only data matching the supplied JSON schema. Do not edit files or generate images.',
      input: [
        { type: 'text', text: prompt },
        ...paths.map((imagePath) => ({ type: 'localImage', path: imagePath, detail: 'original' })),
      ],
      outputSchema,
      timeoutMs: 180_000,
      emptyMessage: 'Codex finished without character part data.',
    });
  }

  async analyzeUiSheet({ cwd, imagePath, sourceIndex = 0, userHint = '', outputSchema }) {
    const prompt = [
      `Inspect source image ${sourceIndex + 1} as a UI sheet, reference board, sprite sheet, or collection of game-art elements.`,
      'Identify every distinct reusable visual element that can be cropped independently.',
      'Bounds use integer x, y, width, height in a normalized 0..1000 coordinate system. Keep each box tight but include the complete object.',
      'Do not merge neighboring elements. Ignore decorative page backgrounds, rulers, labels that only describe the sheet, and duplicate thumbnails.',
      userHint ? `User guidance: ${userHint}` : '',
    ].filter(Boolean).join('\n');
    return this.#runStructuredTurn({
      cwd,
      serviceName: 'Consept Smart Separation',
      baseInstructions: 'You are a visual UI asset detector. Return only data matching the supplied JSON schema. Do not edit files or generate images.',
      input: [{ type: 'text', text: prompt }, { type: 'localImage', path: imagePath, detail: 'original' }],
      outputSchema,
      timeoutMs: 180_000,
      emptyMessage: 'Codex finished without UI element data.',
    });
  }

  async groupUiItems({ cwd, items, userHint = '', outputSchema }) {
    const prompt = [
      'Group these detected visual elements by their practical game/UI purpose.',
      'Choose the number of semantic groups from the content. Avoid one group per item and avoid broad meaningless buckets.',
      'Every item ID must appear exactly once. Use short human-readable group names and stable lowercase slugs.',
      userHint ? `User guidance: ${userHint}` : '',
      JSON.stringify(items.map(({ id, name, role, description, sourceIndex }) => ({ id, name, role, description, sourceIndex }))),
    ].filter(Boolean).join('\n\n');
    return this.#runStructuredTurn({
      cwd,
      serviceName: 'Consept Smart Grouping',
      baseInstructions: 'You organize detected game-art and UI elements. Return only data matching the supplied JSON schema.',
      input: [{ type: 'text', text: prompt }],
      outputSchema,
      timeoutMs: 120_000,
      emptyMessage: 'Codex finished without grouping data.',
    });
  }

  async #runStructuredTurn({ cwd, serviceName, baseInstructions, input, outputSchema, timeoutMs, emptyMessage }) {
    await this.start(cwd);
    const threadResponse = await this.request('thread/start', {
      cwd,
      runtimeWorkspaceRoots: [cwd],
      approvalPolicy: 'never',
      sandbox: 'read-only',
      ephemeral: true,
      serviceName,
      baseInstructions,
    });
    const threadId = threadResponse.thread.id;

    return new Promise(async (resolve, reject) => {
      let text = '';
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.off('notification', handleNotification);
        callback(value);
      };
      const handleNotification = (message) => {
        const notificationThreadId = message.params?.threadId;
        if (notificationThreadId && notificationThreadId !== threadId) return;
        if (message.method === 'item/agentMessage/delta') text += message.params?.delta || '';
        if (message.method === 'item/completed' && message.params?.item?.type === 'agentMessage') text = message.params.item.text || text;
        if (message.method === 'error') finish(reject, new Error(message.params?.message || `${serviceName} failed.`));
        if (message.method === 'turn/completed') {
          try {
            const value = JSON.parse(cleanJsonText(text));
            finish(resolve, value);
          } catch {
            finish(reject, new Error(`${serviceName} returned invalid structured data.`));
          }
        }
      };
      const timeout = setTimeout(() => finish(reject, new Error(`${serviceName} timed out.`)), timeoutMs);
      this.on('notification', handleNotification);
      try {
        await this.request('turn/start', { threadId, input, outputSchema, effort: 'low', approvalPolicy: 'never' });
      } catch (error) {
        finish(reject, error);
      }
    }).then((value) => {
      if (!value || typeof value !== 'object') throw new Error(emptyMessage);
      return value;
    });
  }

  #write(message) {
    this.#child?.stdin.write(`${JSON.stringify(message)}\n`);
  }

  #read(chunk) {
    this.#buffer += chunk.toString();
    const lines = this.#buffer.split(/\r?\n/);
    this.#buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const message = JSON.parse(line);
        if (Object.prototype.hasOwnProperty.call(message, 'id') && (message.result !== undefined || message.error !== undefined)) {
          const pending = this.#pending.get(message.id);
          if (!pending) continue;
          this.#pending.delete(message.id);
          if (message.error) pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
          else pending.resolve(message.result);
          continue;
        }
        if (Object.prototype.hasOwnProperty.call(message, 'id') && message.method) {
          this.#write({ id: message.id, error: { code: -32601, message: `Consept cannot handle server request ${message.method}` } });
          continue;
        }
        if (message.method) this.emit('notification', message);
      } catch (error) {
        this.emit('diagnostic', `Invalid app-server message: ${error.message}`);
      }
    }
  }
}

function cleanPromptText(value) {
  return String(value || '')
    .trim()
    .replace(/^```(?:text)?\s*/i, '')
    .replace(/\s*```$/, '')
    .replace(/^(?:enhanced prompt|prompt)\s*:\s*/i, '')
    .trim()
    .slice(0, 8_000);
}

function cleanJsonText(value) {
  return String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}
