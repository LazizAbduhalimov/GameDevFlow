import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const tripoUrl = 'https://studio.tripo3d.ai/ru/workspace/generate';
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const tripoMultiviewOrder = ['front', 'left', 'right', 'back'];

export class TripoBrowserBridge {
  constructor({ profileDir, modelsDir, onEvent, debugPort = Number(process.env.FRAMEFORGE_TRIPO_DEBUG_PORT || 9333), targetUrl = tripoUrl }) {
    this.profileDir = profileDir;
    this.modelsDir = modelsDir;
    this.onEvent = typeof onEvent === 'function' ? onEvent : () => {};
    this.debugPort = debugPort;
    this.targetUrl = targetUrl;
    this.browserName = 'Chrome';
    this.starting = null;
    this.monitor = null;
  }

  async openWithImage(imagePath, context = {}) {
    if (!imagePath || !existsSync(imagePath)) throw bridgeError('TRIPO_IMAGE_MISSING', 'The selected local image is no longer available.');
    await this.#ensureBrowser();
    const target = await this.#getOrCreateTarget();
    const client = new CdpClient(target.webSocketDebuggerUrl);
    await client.connect();
    try {
      await Promise.all([
        client.request('DOM.enable'),
        client.request('Runtime.enable'),
        client.request('Page.enable'),
      ]);
      await this.#focusBrowserWindow(client, target.id);
      await this.#waitForPageReady(client);
      await this.#requireSignedIn(client);
      const fileName = await this.#attachImage(client, imagePath);
      const watcherId = await this.#armMonitor(target, context);
      return { ok: true, browser: this.browserName, url: this.targetUrl, fileName, watcherId };
    } finally {
      client.close();
    }
  }

  async openWithMultiview(viewPaths, context = {}) {
    const normalized = normalizeMultiviewPaths(viewPaths);
    await this.#ensureBrowser();
    const target = await this.#getOrCreateTarget();
    const client = new CdpClient(target.webSocketDebuggerUrl);
    await client.connect();
    try {
      await Promise.all([
        client.request('DOM.enable'),
        client.request('Runtime.enable'),
        client.request('Page.enable'),
      ]);
      await this.#focusBrowserWindow(client, target.id);
      await this.#waitForPageReady(client);
      await this.#requireSignedIn(client);
      await this.#selectMultiviewMode(client);

      // Upload in reverse visual order. If Tripo replaces a filled file input,
      // the remaining earlier slots still keep their positions.
      const fileNames = {};
      for (const slot of [...tripoMultiviewOrder].reverse()) {
        fileNames[slot] = await this.#attachMultiviewImage(client, slot, normalized[slot]);
      }
      const watcherId = await this.#armMonitor(target, context);
      await this.#focusBrowserWindow(client, target.id);
      return { ok: true, browser: this.browserName, url: this.targetUrl, fileNames, watcherId };
    } finally {
      client.close();
    }
  }

  async recoverCurrentModel(context = {}) {
    await this.#ensureBrowser();
    const target = await this.#findExistingTarget();
    if (!target) throw bridgeError('TRIPO_RESULT_TAB_MISSING', 'Open the completed Tripo generation tab, then retry the preview.');
    const watcherId = await this.#armMonitor(target, { ...context, recoverCurrentResult: true });
    const monitor = this.monitor;
    this.#markGenerationStarted(monitor);
    const recovered = await this.#inspectPageForReadyModel(monitor, { allowCurrent: true });
    if (!recovered) throw bridgeError('TRIPO_RESULT_NOT_READY', 'The open Tripo tab does not contain a completed GLB result yet.');
    return { ok: true, watcherId, taskId: monitor.taskId, recovered: monitor.completed, event: monitor.resultEvent || null };
  }

  async #ensureBrowser() {
    if (await this.#debugEndpointReady()) return;
    if (this.starting) return this.starting;
    this.starting = (async () => {
      const executable = findChromiumExecutable();
      if (!executable) throw bridgeError('TRIPO_BROWSER_MISSING', 'Google Chrome or Microsoft Edge is required for the local Tripo bridge.');
      this.browserName = path.basename(executable).toLowerCase().startsWith('msedge') ? 'Microsoft Edge' : 'Google Chrome';
      await mkdir(this.profileDir, { recursive: true });
      const child = spawn(executable, [
        `--remote-debugging-port=${this.debugPort}`,
        `--user-data-dir=${this.profileDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--new-window',
        'about:blank',
      ], { detached: true, stdio: 'ignore', windowsHide: false });
      child.unref();
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (await this.#debugEndpointReady()) return;
        await delay(250);
      }
      throw bridgeError('TRIPO_BROWSER_START_FAILED', `${this.browserName} started, but Frameforge could not connect to its local automation port.`);
    })().finally(() => { this.starting = null; });
    return this.starting;
  }

  async #debugEndpointReady() {
    try {
      const response = await fetch(`http://127.0.0.1:${this.debugPort}/json/version`, { signal: AbortSignal.timeout(700) });
      return response.ok;
    } catch { return false; }
  }

  async #getOrCreateTarget() {
    const existing = await this.#findExistingTarget();
    if (existing) return existing;
    const response = await fetch(`http://127.0.0.1:${this.debugPort}/json/new?${encodeURIComponent(this.targetUrl)}`, {
      method: 'PUT',
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw bridgeError('TRIPO_TAB_FAILED', 'Could not open a controlled Tripo tab.');
    return response.json();
  }

  async #findExistingTarget() {
    const response = await fetch(`http://127.0.0.1:${this.debugPort}/json/list`, { signal: AbortSignal.timeout(3_000) });
    if (!response.ok) return null;
    const targets = await response.json();
    return targets.find((target) => target.type === 'page' && target.url?.includes('/workspace/generate') && target.webSocketDebuggerUrl) || null;
  }

  async #focusBrowserWindow(client, targetId) {
    try {
      const window = await client.request('Browser.getWindowForTarget', { targetId });
      if (window?.bounds?.windowState === 'minimized') {
        await client.request('Browser.setWindowBounds', { windowId: window.windowId, bounds: { windowState: 'normal' } });
      }
      await client.request('Page.bringToFront');
    } catch {
      await client.request('Page.bringToFront').catch(() => {});
    }
    await this.#focusNativeWindow();
  }

  async #focusNativeWindow() {
    if (process.platform !== 'win32') return;
    const processName = this.browserName === 'Microsoft Edge' ? 'msedge.exe' : 'chrome.exe';
    const script = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class FrameforgeWindow {
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
'@
$browser = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq '${processName}' -and $_.CommandLine -like '*--remote-debugging-port=${this.debugPort}*' -and $_.CommandLine -notlike '*--type=*' } | Select-Object -First 1
if ($browser) {
  $process = Get-Process -Id $browser.ProcessId -ErrorAction SilentlyContinue
  if ($process -and $process.MainWindowHandle -ne 0) {
    [FrameforgeWindow]::ShowWindowAsync($process.MainWindowHandle, 9) | Out-Null
    $shell = New-Object -ComObject WScript.Shell
    $shell.AppActivate([int]$browser.ProcessId) | Out-Null
    [FrameforgeWindow]::SetForegroundWindow($process.MainWindowHandle) | Out-Null
  }
}
`;
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    await new Promise((resolve) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded], {
        stdio: 'ignore',
        windowsHide: true,
      });
      const timeout = setTimeout(() => { child.kill(); resolve(); }, 4_000);
      child.once('close', () => { clearTimeout(timeout); resolve(); });
      child.once('error', () => { clearTimeout(timeout); resolve(); });
    });
  }

  async #waitForPageReady(client) {
    for (let attempt = 0; attempt < 90; attempt += 1) {
      const result = await client.request('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
      if (result?.result?.value === 'complete') {
        await delay(900);
        return;
      }
      await delay(250);
    }
    throw bridgeError('TRIPO_PAGE_TIMEOUT', 'Tripo did not finish loading. Complete any browser check, then press the Tripo button again.');
  }

  async #requireSignedIn(client) {
    const labels = ['registration/login', 'sign up/log in', 'log in', 'sign in', 'регистрация/вход'];
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const result = await client.request('Runtime.evaluate', {
        expression: `(() => { const labels = ${JSON.stringify(labels)}; return [...document.querySelectorAll('button')].some((button) => labels.includes(button.innerText.trim().toLowerCase())); })()`,
        returnByValue: true,
      });
      if (result?.result?.value) {
        throw bridgeError('TRIPO_LOGIN_REQUIRED', 'Sign in to Tripo in the opened Chrome window, then press the Tripo button again. The login will stay saved locally.');
      }
      if (attempt >= 8) return;
      await delay(250);
    }
  }

  async #attachImage(client, imagePath) {
    const absolutePath = path.resolve(imagePath);
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const document = await client.request('DOM.getDocument', { depth: 2, pierce: true });
      const result = await client.request('DOM.querySelector', {
        nodeId: document.root.nodeId,
        selector: 'input[type="file"][accept*="image"], input[type="file"][accept*="png"], input[type="file"]',
      });
      if (!result.nodeId) {
        await delay(500);
        continue;
      }
      try {
        await client.request('DOM.setFileInputFiles', { files: [absolutePath], nodeId: result.nodeId });
        const resolved = await client.request('DOM.resolveNode', { nodeId: result.nodeId });
        const verification = await client.request('Runtime.callFunctionOn', {
          objectId: resolved.object.objectId,
          functionDeclaration: 'function () { return { count: this.files?.length || 0, name: this.files?.[0]?.name || "" }; }',
          returnByValue: true,
        });
        if (verification?.result?.value?.count) {
          await client.request('Runtime.callFunctionOn', {
            objectId: resolved.object.objectId,
            functionDeclaration: 'function () { this.dispatchEvent(new Event("input", { bubbles: true })); this.dispatchEvent(new Event("change", { bubbles: true })); }',
          });
          await delay(500);
          return verification.result.value.name;
        }
      } catch (error) {
        const staleNode = error?.code === 'TRIPO_CDP_COMMAND_FAILED' && /node|object/i.test(error.message);
        if (!staleNode) throw error;
      }
      await delay(350);
    }
    throw bridgeError('TRIPO_UPLOAD_NOT_FOUND', 'Tripo opened, but its live image upload field could not be attached. Complete any login or browser check, then press the Tripo button again.');
  }

  async #selectMultiviewMode(client) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const result = await client.request('Runtime.evaluate', {
        expression: `(() => {
          const icon = [...document.querySelectorAll('div')].find((element) => element.classList.contains('i-tripo:multi-view'));
          const button = icon?.closest('button');
          if (!button) return false;
          button.click();
          return true;
        })()`,
        returnByValue: true,
      });
      if (result?.result?.value) break;
      await delay(350);
      if (attempt === 29) throw bridgeError('TRIPO_MULTIVIEW_NOT_FOUND', 'Tripo opened, but its Multi View selector could not be found.');
    }

    // Tripo removes each file input after a slot is filled. Clear any previous
    // Multi View selection so a later Frameforge send replaces all four views.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const result = await client.request('Runtime.evaluate', {
        expression: `(() => {
          const icon = [...document.querySelectorAll('div')].find((element) => element.classList.contains('i-tripo:multi-view'));
          const panel = icon?.closest('button')?.parentElement?.parentElement?.parentElement;
          const deleteButton = [...(panel?.querySelectorAll('div') || [])]
            .find((element) => element.classList.contains('i-tripo:delete'))?.closest('button');
          if (!deleteButton) return false;
          deleteButton.click();
          return true;
        })()`,
        returnByValue: true,
      });
      if (!result?.result?.value) break;
      await delay(220);
    }

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const result = await client.request('Runtime.evaluate', {
        expression: `(() => {
          const icon = [...document.querySelectorAll('div')].find((element) => element.classList.contains('i-tripo:multi-view'));
          const panel = icon?.closest('button')?.parentElement?.parentElement?.parentElement;
          return [...(panel?.querySelectorAll('input[type="file"]') || [])]
            .filter((input) => /image|png|jpe?g|webp/i.test(input.accept || '')).length;
        })()`,
        returnByValue: true,
      });
      if (Number(result?.result?.value) >= 4) return;
      await delay(350);
    }
    throw bridgeError('TRIPO_MULTIVIEW_UPLOAD_NOT_FOUND', 'Tripo switched modes, but its four Multi View upload fields did not appear.');
  }

  async #attachMultiviewImage(client, slot, imagePath) {
    const absolutePath = path.resolve(imagePath);
    const expectedIndex = tripoMultiviewOrder.indexOf(slot);
    let lastError = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const result = await client.request('Runtime.evaluate', {
        expression: `(() => {
          const icon = [...document.querySelectorAll('div')].find((element) => element.classList.contains('i-tripo:multi-view'));
          const panel = icon?.closest('button')?.parentElement?.parentElement?.parentElement;
          const inputs = [...(panel?.querySelectorAll('input[type="file"]') || [])]
            .filter((input) => /image|png|jpe?g|webp/i.test(input.accept || ''));
          const iconClass = 'i-tripo:${slot}-view';
          const labelled = inputs.find((input) => {
            let parent = input.parentElement;
            for (let level = 0; parent && level < 3; level += 1, parent = parent.parentElement) {
              if ([...parent.querySelectorAll('div')].some((element) => element.classList.contains(iconClass))) return true;
            }
            return false;
          });
          return labelled || inputs[${expectedIndex}] || null;
        })()`,
      });
      const objectId = result?.result?.objectId;
      if (!objectId) {
        await delay(350);
        continue;
      }
      try {
        await client.request('DOM.setFileInputFiles', { files: [absolutePath], objectId });
        // Multi View replaces the input immediately after setFileInputFiles.
        // Dispatch when the node survives, but a stale object here means Tripo
        // has already accepted the file and rendered its preview.
        await client.request('Runtime.callFunctionOn', {
          objectId,
          functionDeclaration: 'function () { this.dispatchEvent(new Event("input", { bubbles: true })); this.dispatchEvent(new Event("change", { bubbles: true })); }',
        }).catch(() => {});
        await delay(650);
        return path.basename(absolutePath);
      } catch (error) {
        lastError = error;
        const staleNode = error?.code === 'TRIPO_CDP_COMMAND_FAILED' && /node|object/i.test(error.message);
        if (!staleNode) throw error;
      }
      await delay(350);
    }
    const detail = lastError instanceof Error ? ` ${lastError.message}` : '';
    throw bridgeError('TRIPO_MULTIVIEW_UPLOAD_FAILED', `Tripo's ${slot} Multi View image field could not be attached.${detail}`);
  }

  async #armMonitor(target, context) {
    if (this.monitor) {
      this.monitor.replaced = true;
      if (this.monitor.pollTimer) clearInterval(this.monitor.pollTimer);
      this.monitor.client.close();
    }
    const client = new CdpClient(target.webSocketDebuggerUrl);
    await client.connect();
    const monitor = {
      client,
      watcherId: cleanWatcherId(context?.watcherId) || randomUUID(),
      sourceNodeId: cleanSourceNodeId(context?.sourceNodeId),
      requests: new Map(),
      capturedUrls: new Set(),
      generationDetected: false,
      completed: false,
      failed: false,
      taskId: null,
      progress: null,
      baselineTaskId: null,
      baselineModelUrls: new Set(),
      pollTimer: null,
      chain: Promise.resolve(),
    };
    this.monitor = monitor;
    client.onEvent((method, params) => {
      monitor.chain = monitor.chain
        .then(() => this.#handleMonitorEvent(monitor, method, params))
        .catch((error) => console.error('Tripo monitor event failed:', error));
    });
    client.onClose(() => {
      if (this.monitor !== monitor || monitor.replaced || monitor.completed || monitor.failed) return;
      if (monitor.pollTimer) clearInterval(monitor.pollTimer);
      this.#emit(monitor, 'watcher-disconnected', { message: 'The Tripo tab closed before a model was received.' });
      this.monitor = null;
    });
    await Promise.all([
      client.request('Network.enable', { maxTotalBufferSize: 220_000_000, maxResourceBufferSize: 180_000_000 }),
      client.request('Runtime.enable'),
      client.request('Page.enable'),
    ]);
    await client.request('Runtime.evaluate', {
      expression: `(() => {
        if (window.__frameforgeTripoGenerateListener) return true;
        window.__frameforgeTripoGenerateListener = true;
        document.addEventListener('click', (event) => {
          const button = event.target?.closest?.('button');
          const label = button?.innerText?.trim?.().toLowerCase?.() || '';
          if (/generate|create model|генер|создать модель/.test(label)) console.debug('__FRAMEFORGE_TRIPO_GENERATE__');
        }, true);
        return true;
      })()`,
      returnByValue: true,
    }).catch(() => {});
    const baseline = await this.#readPageModelState(client).catch(() => null);
    monitor.baselineTaskId = baseline?.taskId || null;
    monitor.baselineModelUrls = new Set(baseline?.modelUrls || []);
    this.#emit(monitor, 'watching', { message: 'Waiting for Generate in Tripo Studio.' });
    return monitor.watcherId;
  }

  async #handleMonitorEvent(monitor, method, params = {}) {
    if (this.monitor !== monitor || monitor.completed || monitor.failed) return;
    if (method === 'Runtime.consoleAPICalled') {
      const values = params.args?.map((arg) => arg.value).filter((value) => typeof value === 'string') || [];
      if (values.includes('__FRAMEFORGE_TRIPO_GENERATE__')) this.#markGenerationStarted(monitor);
      return;
    }
    if (method === 'Network.requestWillBeSent') {
      const request = params.request || {};
      monitor.requests.set(params.requestId, { url: request.url || '', method: request.method || 'GET', mimeType: '' });
      if (request.method === 'POST' && looksLikeTripoGenerationRequest(request.url)) this.#markGenerationStarted(monitor);
      if (typeof request.postData === 'string' && request.postData.length < 1_000_000) this.#inspectPayloadText(monitor, request.postData);
      return;
    }
    if (method === 'Network.responseReceived') {
      const request = monitor.requests.get(params.requestId) || {};
      request.url = params.response?.url || request.url || '';
      request.mimeType = params.response?.mimeType || '';
      request.status = params.response?.status;
      request.resourceType = params.type || '';
      monitor.requests.set(params.requestId, request);
      return;
    }
    if (method === 'Network.webSocketFrameReceived') {
      this.#inspectPayloadText(monitor, params.response?.payloadData || '');
      return;
    }
    if (method !== 'Network.loadingFinished') return;
    const request = monitor.requests.get(params.requestId);
    monitor.requests.delete(params.requestId);
    if (!request?.url || Number(request.status || 0) >= 400) return;
    const modelResponse = looksLikeTripoResultModelUrl(request.url, request.mimeType);
    const inspectJson = isTripoHost(request.url)
      && (request.resourceType === 'XHR' || request.resourceType === 'Fetch' || /json/i.test(request.mimeType))
      && Number(params.encodedDataLength || 0) < 6_000_000;
    if (!modelResponse && !inspectJson) return;
    let body;
    try { body = await monitor.client.request('Network.getResponseBody', { requestId: params.requestId }); }
    catch { body = null; }
    if (modelResponse && monitor.generationDetected) {
      const buffer = body?.body ? Buffer.from(body.body, body.base64Encoded ? 'base64' : 'binary') : null;
      await this.#captureModel(monitor, request.url, buffer, request.mimeType);
      return;
    }
    if (body?.body && !body.base64Encoded) this.#inspectPayloadText(monitor, body.body);
  }

  #inspectPayloadText(monitor, text) {
    if (typeof text !== 'string' || !text || text.length > 6_000_000) return;
    let payload;
    try { payload = JSON.parse(text); } catch { return; }
    const result = extractTripoResult(payload);
    if (result.taskId) monitor.taskId = result.taskId;
    if (result.taskId || ['queued', 'running'].includes(result.status || '')) this.#markGenerationStarted(monitor);
    if (monitor.generationDetected && Number.isFinite(result.progress) && result.progress !== monitor.progress) {
      monitor.progress = result.progress;
      this.#emit(monitor, 'generation-progress', { taskId: monitor.taskId, progress: result.progress, status: result.status || 'running' });
    }
    if (monitor.generationDetected && ['failed', 'cancelled', 'banned', 'expired'].includes(result.status || '')) {
      monitor.failed = true;
      if (monitor.pollTimer) clearInterval(monitor.pollTimer);
      this.#emit(monitor, 'generation-failed', { taskId: monitor.taskId, status: result.status, message: `Tripo generation ${result.status}.` });
      return;
    }
    if (!monitor.generationDetected || !result.modelUrls.length) return;
    void this.#captureModel(monitor, result.modelUrls[0], null, 'model/gltf-binary');
  }

  #markGenerationStarted(monitor) {
    if (monitor.generationDetected || monitor.completed || monitor.failed) return;
    monitor.generationDetected = true;
    this.#emit(monitor, 'generation-started', { taskId: monitor.taskId, status: 'running', progress: 0, message: 'Tripo model generation started.' });
    monitor.pollTimer = setInterval(() => {
      monitor.chain = monitor.chain
        .then(() => this.#inspectPageForReadyModel(monitor))
        .catch((error) => console.error('Tripo result scan failed:', error));
    }, 1_500);
  }

  async #readPageModelState(client) {
    const result = await client.request('Runtime.evaluate', {
      expression: `(() => ({
        href: location.href,
        modelUrls: performance.getEntriesByType('resource').map((entry) => entry.name).filter((value) => /\\.(?:glb|gltf)(?:$|[?#])/i.test(value))
      }))()`,
      returnByValue: true,
    });
    const value = result?.result?.value || {};
    const taskId = /\/workspace\/generate\/([a-z0-9-]{8,})/i.exec(value.href || '')?.[1] || null;
    return { taskId, modelUrls: Array.isArray(value.modelUrls) ? value.modelUrls.filter((url) => looksLikeTripoResultModelUrl(url)) : [] };
  }

  async #inspectPageForReadyModel(monitor, { allowCurrent = false } = {}) {
    if (this.monitor !== monitor || monitor.completed || monitor.failed) return false;
    const state = await this.#readPageModelState(monitor.client).catch(() => null);
    if (!state) return false;
    const changedTask = Boolean(state.taskId && state.taskId !== monitor.baselineTaskId);
    const freshModels = state.modelUrls.filter((url) => !monitor.baselineModelUrls.has(url));
    const candidate = [...freshModels, ...(allowCurrent ? state.modelUrls : [])][0];
    if (!candidate || (!allowCurrent && !changedTask && !freshModels.length)) return false;
    if (state.taskId) monitor.taskId = state.taskId;
    await this.#captureModel(monitor, candidate, null, 'model/gltf-binary');
    return monitor.completed;
  }

  async #captureModel(monitor, modelUrl, responseBuffer, mimeType) {
    if (this.monitor !== monitor || monitor.completed || monitor.failed || !modelUrl || monitor.capturedUrls.has(modelUrl)) return;
    monitor.capturedUrls.add(modelUrl);
    try {
      let buffer = responseBuffer;
      if (!buffer?.length || !isGlbBuffer(buffer)) buffer = await downloadTripoModel(modelUrl);
      if (!buffer?.length || !isGlbBuffer(buffer)) throw bridgeError('TRIPO_MODEL_INVALID', 'Tripo returned a model format that the local GLB viewer cannot open.');
      await mkdir(this.modelsDir, { recursive: true });
      const fileName = `tripo-${monitor.taskId || 'model'}-${randomUUID().slice(0, 8)}.glb`;
      await writeFile(path.join(this.modelsDir, fileName), buffer, { flag: 'wx' });
      const savedName = fileName;
      monitor.completed = true;
      if (monitor.pollTimer) clearInterval(monitor.pollTimer);
      monitor.resultEvent = this.#emit(monitor, 'model-ready', {
        taskId: monitor.taskId,
        status: 'ready',
        progress: 100,
        fileName: savedName,
        modelUrl: `/data/models/${encodeURIComponent(savedName)}`,
        downloadUrl: `/api/integrations/tripo/models/${encodeURIComponent(savedName)}/download`,
        mimeType: mimeType || 'model/gltf-binary',
        message: 'Tripo model saved locally.',
      });
    } catch (error) {
      monitor.capturedUrls.delete(modelUrl);
      console.error('Tripo model capture failed:', error);
      this.#emit(monitor, 'capture-warning', { taskId: monitor.taskId, message: error instanceof Error ? error.message : 'Could not save the Tripo model locally.' });
    }
  }

  #emit(monitor, type, payload = {}) {
    const event = {
      id: randomUUID(),
      type,
      watcherId: monitor.watcherId,
      sourceNodeId: monitor.sourceNodeId,
      createdAt: new Date().toISOString(),
      ...payload,
    };
    this.onEvent(event);
    return event;
  }

  snapshot() {
    const monitor = this.monitor;
    return monitor ? {
      watching: !monitor.completed && !monitor.failed,
      watcherId: monitor.watcherId,
      sourceNodeId: monitor.sourceNodeId,
      generationDetected: monitor.generationDetected,
      taskId: monitor.taskId,
      progress: monitor.progress,
    } : { watching: false };
  }
}

export function normalizeMultiviewPaths(viewPaths) {
  const normalized = {};
  for (const slot of ['front', 'left', 'back', 'right']) {
    const imagePath = typeof viewPaths?.[slot] === 'string' ? viewPaths[slot] : '';
    if (!imagePath || !existsSync(imagePath)) {
      throw bridgeError('TRIPO_MULTIVIEW_IMAGE_MISSING', `The ${slot} Character View image is no longer available.`);
    }
    normalized[slot] = path.resolve(imagePath);
  }
  return normalized;
}

export function extractTripoResult(payload) {
  const state = { taskId: null, status: null, progress: null, modelCandidates: [], previewUrls: [] };
  const visit = (value, parentKey = '', depth = 0) => {
    if (depth > 12 || value === null || value === undefined) return;
    if (Array.isArray(value)) {
      for (const child of value) visit(child, parentKey, depth + 1);
      return;
    }
    if (typeof value !== 'object') return;
    for (const [rawKey, child] of Object.entries(value)) {
      const key = rawKey.toLowerCase();
      if ((key === 'task_id' || key === 'taskid') && typeof child === 'string' && child) state.taskId = child.slice(0, 160);
      if (key === 'status' && typeof child === 'string' && ['queued', 'running', 'success', 'failed', 'cancelled', 'banned', 'expired'].includes(child.toLowerCase())) state.status = child.toLowerCase();
      if (key === 'progress' && Number.isFinite(Number(child))) state.progress = Math.max(0, Math.min(100, Number(child)));
      const urls = stringUrls(child);
      const priority = key === 'pbr_model' || key === 'pbrmodel' ? 0
        : key === 'model' || key === 'model_url' || key === 'modelurl' ? 1
          : key === 'base_model' || key === 'basemodel' ? 2 : 5;
      if (priority < 5) {
        for (const url of urls) if (/^https?:\/\//i.test(url) && isAllowedTripoDownloadUrl(url)) state.modelCandidates.push({ url, priority });
      } else if (/rendered_image|preview|thumbnail/.test(key)) {
        for (const url of urls) if (/^https?:\/\//i.test(url)) state.previewUrls.push(url);
      } else if (typeof child === 'string' && looksLikeTripoModelUrl(child)) {
        state.modelCandidates.push({ url: child, priority: 4 });
      }
      visit(child, key || parentKey, depth + 1);
    }
  };
  visit(payload);
  state.modelCandidates.sort((left, right) => left.priority - right.priority);
  return {
    taskId: state.taskId,
    status: state.status,
    progress: state.progress,
    modelUrls: [...new Set(state.modelCandidates.map((candidate) => candidate.url))],
    previewUrls: [...new Set(state.previewUrls)],
  };
}

export function looksLikeTripoModelUrl(value, mimeType = '') {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return false;
  return /\.(?:glb|gltf)(?:$|[?#])/i.test(value)
    || /(?:format|file_type|extension)=glb(?:&|$)/i.test(value)
    || /model\/gltf|model\/gltf-binary/i.test(mimeType);
}

export function looksLikeTripoResultModelUrl(value, mimeType = '') {
  if (!looksLikeTripoModelUrl(value, mimeType) || !isAllowedTripoDownloadUrl(value)) return false;
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    if ((host === 'studio.tripo3d.ai' || host === 'www.tripo3d.ai') && pathname.startsWith('/viewer/')) return false;
    return host.endsWith('.data.tripo3d.com')
      || /\/tripo-studio\/|tripo_model_|meshopt|pbr_model|\/output\/|\/result\//i.test(pathname)
      || /(?:format|file_type|extension)=glb(?:&|$)/i.test(parsed.search.slice(1));
  } catch { return false; }
}

export function isAllowedTripoDownloadUrl(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === 'tripo3d.ai' || host.endsWith('.tripo3d.ai') || host === 'tripo3d.com' || host.endsWith('.tripo3d.com') || host === 'amazonaws.com' || host.endsWith('.amazonaws.com') || host.endsWith('.cloudfront.net');
  } catch { return false; }
}

function stringUrls(value) {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object') return [];
  return ['url', 'href', 'uri'].map((key) => value[key]).filter((child) => typeof child === 'string');
}

function isTripoHost(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === 'tripo3d.ai' || host.endsWith('.tripo3d.ai');
  } catch { return false; }
}

function looksLikeTripoGenerationRequest(value) {
  if (!isTripoHost(value)) return false;
  try { return /(?:^|\/)(?:task|generate)(?:\/|$)|image[-_]?to[-_]?model|multiview[-_]?to[-_]?model/i.test(new URL(value).pathname); }
  catch { return false; }
}

function cleanSourceNodeId(value) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9._:-]{0,199}$/i.test(value) ? value : null;
}

function cleanWatcherId(value) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{7,99}$/i.test(value) ? value : null;
}

function isGlbBuffer(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'glTF';
}

async function downloadTripoModel(modelUrl) {
  if (!isAllowedTripoDownloadUrl(modelUrl)) throw bridgeError('TRIPO_MODEL_HOST_BLOCKED', 'Tripo returned a model download from an unexpected host.');
  const response = await fetch(modelUrl, { redirect: 'follow', signal: AbortSignal.timeout(90_000) });
  if (!response.ok) throw bridgeError('TRIPO_MODEL_DOWNLOAD_FAILED', `Tripo model download failed with status ${response.status}.`);
  const length = Number(response.headers.get('content-length') || 0);
  if (length > 200 * 1024 * 1024) throw bridgeError('TRIPO_MODEL_TOO_LARGE', 'The Tripo model is larger than the 200 MB local import limit.');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 200 * 1024 * 1024) throw bridgeError('TRIPO_MODEL_TOO_LARGE', 'The Tripo model is larger than the 200 MB local import limit.');
  return buffer;
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
    this.eventHandlers = new Set();
    this.closeHandlers = new Set();
  }

  connect() {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      this.socket = socket;
      const timeout = setTimeout(() => reject(bridgeError('TRIPO_CDP_TIMEOUT', 'Timed out while connecting to the local Tripo browser.')), 5_000);
      socket.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timeout); reject(bridgeError('TRIPO_CDP_FAILED', 'Could not control the local Tripo browser.')); }, { once: true });
      socket.addEventListener('message', (event) => this.#handleMessage(event.data));
      socket.addEventListener('close', () => {
        for (const pending of this.pending.values()) pending.reject(bridgeError('TRIPO_TAB_CLOSED', 'The Tripo tab closed before the image was attached.'));
        this.pending.clear();
        for (const handler of this.closeHandlers) handler();
      });
    });
  }

  request(method, params = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return Promise.reject(bridgeError('TRIPO_CDP_FAILED', 'The local Tripo browser is not connected.'));
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(bridgeError('TRIPO_CDP_TIMEOUT', `Tripo browser command ${method} timed out.`));
      }, 10_000);
      this.pending.set(id, { resolve, reject, timeout });
    });
  }

  close() {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.close();
  }

  onEvent(handler) {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  onClose(handler) {
    this.closeHandlers.add(handler);
    return () => this.closeHandlers.delete(handler);
  }

  #handleMessage(raw) {
    let message;
    try { message = JSON.parse(String(raw)); } catch { return; }
    if (!message.id) {
      if (message.method) for (const handler of this.eventHandlers) handler(message.method, message.params || {});
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    clearTimeout(pending.timeout);
    if (message.error) pending.reject(bridgeError('TRIPO_CDP_COMMAND_FAILED', message.error.message || 'Tripo browser command failed.'));
    else pending.resolve(message.result);
  }
}

function findChromiumExecutable() {
  const candidates = process.platform === 'win32' ? [
    path.join(process.env.ProgramFiles || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.ProgramFiles || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ] : ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/microsoft-edge'];
  return candidates.find((candidate) => candidate && existsSync(candidate));
}

function bridgeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
