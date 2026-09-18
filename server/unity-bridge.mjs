import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { readJson, writeJsonAtomic } from './json-store.mjs';
import { imageExtension, resolveWithin, safeUnityFileName, unityFolderName } from './path-safety.mjs';

const execFileAsync = promisify(execFile);
const UNITY_GROUPS = new Set(['source', 'generated', 'views', 'atlases', 'materials', 'models']);
const VIEW_KEYS = new Set(['front', 'left', 'back', 'right']);
const MAP_KEYS = new Set(['baseColor', 'normal', 'height', 'roughness', 'metallic', 'ambientOcclusion', 'orm']);
const GLTF_PACKAGE_IDS = ['com.unity.cloud.gltfast', 'com.atteneder.gltfast', 'org.khronos.unitygltf', 'com.unity.formats.gltf'];
const DEFAULT_EDITOR_SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'unity-bridge', 'ConseptUnityBridge.cs');

export class UnityBridge {
  constructor(options = {}) {
    this.settingsPath = options.settingsPath;
    this.editorScriptPath = options.editorScriptPath || DEFAULT_EDITOR_SCRIPT;
    this.env = options.env || process.env;
    this.platform = options.platform || process.platform;
    this.listProcesses = options.listProcesses || (() => listUnityProcesses(this.platform));
    this.focusProcess = options.focusProcess || ((pid) => focusUnityWindow(pid, this.platform));
    this.launchEditor = options.launchEditor || launchUnityEditor;
    this.now = options.now || (() => new Date().toISOString());
  }

  async status() {
    const settings = await this.#readSettings();
    const running = await this.#runningProjects();
    const recents = await listHubProjects(this.env, this.platform);
    const target = this.#resolveTarget({ settings, running, recents });
    return {
      ready: Boolean(target),
      target,
      running,
      recents: recents.filter((project) => !running.some((item) => samePath(item.path, project.path))),
    };
  }

  async setTarget(projectPath) {
    const project = inspectUnityProject(projectPath);
    if (!project) throw bridgeError('UNITY_PATH_INVALID', 'Choose a Unity project folder that contains Assets and ProjectSettings.');
    await writeJsonAtomic(this.settingsPath, { targetPath: project.path, updatedAt: this.now() });
    return this.status();
  }

  async send({ projectName, items, placeOnScene = false, projectPath, focus = true, launch = true }) {
    const status = await this.status();
    const targetPath = projectPath || status.target?.path;
    const project = inspectUnityProject(targetPath);
    if (!project) throw bridgeError('UNITY_PROJECT_MISSING', 'Open a Unity project, then try again.');

    const copies = [];
    for (const item of items || []) {
      copies.push(await this.#copyItem(project.path, projectName, item));
    }
    if (!copies.length) throw bridgeError('UNITY_ITEMS_MISSING', 'Choose a local Consept image or model to send to Unity.');

    const gltf = copies.some((item) => item.kind === 'model')
      ? await this.#ensureGltfImporter(project)
      : { added: false };
    await this.#writeEditorScript(project.path);
    await this.#writeCommand(project.path, { placeOnScene: Boolean(placeOnScene), assets: copies });
    await writeJsonAtomic(this.settingsPath, { targetPath: project.path, lastSentAt: this.now(), updatedAt: this.now() });

    const running = (await this.#runningProjects()).find((item) => samePath(item.path, project.path));
    let launched = false;
    if (running) {
      if (focus) await this.focusProcess(running.pid).catch(() => {});
    } else if (launch) {
      const editorPath = await resolveEditorExecutable(project, this.env, this.platform);
      if (!editorPath) throw bridgeError('UNITY_EDITOR_MISSING', 'Unity Editor was not found. Open the project from Unity Hub once, then retry.');
      await this.launchEditor(editorPath, project.path);
      launched = true;
    }

    const folder = copies[0].unityPath.split('/').slice(0, 3).join('/');
    return {
      ok: true,
      projectPath: project.path,
      projectName: project.name,
      unityFolder: unityFolderName(projectName),
      copied: copies.map((item) => item.unityPath),
      gltFastAdded: Boolean(gltf.added),
      launched,
      focused: Boolean(running),
      message: toastMessage(folder, copies, gltf.added, launched),
    };
  }

  async #copyItem(unityProjectPath, projectName, item) {
    const relative = relativeUnityAssetPath({
      projectName,
      group: item.group,
      title: item.title,
      fileName: item.fileName,
      viewKey: item.viewKey,
      mapKey: item.mapKey,
      extension: item.extension || path.extname(item.sourcePath || item.fileName || ''),
    });
    const destination = resolveUnityAssetDestination(unityProjectPath, relative);
    if (!destination) throw bridgeError('UNITY_PATH_INVALID', 'Unity destination must stay inside the project Assets folder.');
    if (!item.sourcePath || !existsSync(item.sourcePath)) throw bridgeError('UNITY_SOURCE_MISSING', 'The selected Consept file is no longer available locally.');
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(item.sourcePath, destination);
    return {
      unityPath: relative,
      kind: item.group === 'models' ? 'model' : 'image',
      name: `Consept ${unityFolderName(item.title || item.fileName || path.basename(destination, path.extname(destination)), 'asset')}`,
      destination,
    };
  }

  async #writeEditorScript(unityProjectPath) {
    const destination = resolveUnityAssetDestination(unityProjectPath, 'Assets/Consept/Editor/ConseptUnityBridge.cs');
    if (!destination) throw bridgeError('UNITY_PATH_INVALID', 'Unity destination must stay inside the project Assets folder.');
    const source = await readFile(this.editorScriptPath, 'utf8');
    const previous = await readFile(destination, 'utf8').catch(() => null);
    if (previous === source) return false;
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, source, 'utf8');
    return true;
  }

  async #writeCommand(unityProjectPath, command) {
    const commandPath = resolveWithin(unityProjectPath, path.join('Temp', 'Consept', 'command.json'));
    if (!commandPath) throw bridgeError('UNITY_PATH_INVALID', 'Unity destination must stay inside the selected project.');
    await mkdir(path.dirname(commandPath), { recursive: true });
    await writeJsonAtomic(commandPath, {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: this.now(),
      placeOnScene: Boolean(command.placeOnScene),
      assets: command.assets.map((item) => ({ unityPath: item.unityPath, kind: item.kind, name: item.name })),
    });
  }

  async #ensureGltfImporter(project) {
    const manifestPath = path.join(project.path, 'Packages', 'manifest.json');
    const manifest = await readJson(manifestPath, null);
    if (!manifest || typeof manifest !== 'object') return { added: false };
    const next = ensureGltfImporter(manifest, project.editorVersion);
    if (next.added) await writeJsonAtomic(manifestPath, next.manifest);
    return next;
  }

  async #runningProjects() {
    const processes = await this.listProcesses().catch(() => []);
    const seen = new Set();
    const projects = [];
    for (const processInfo of processes) {
      const projectPath = parseUnityProjectPathFromCommandLine(processInfo.commandLine);
      const project = inspectUnityProject(projectPath);
      if (!project || seen.has(project.path.toLowerCase())) continue;
      seen.add(project.path.toLowerCase());
      projects.push({
        path: project.path,
        name: project.name,
        pid: processInfo.pid,
        editorPath: processInfo.executable || null,
        source: 'running',
        running: true,
      });
    }
    return projects;
  }

  async #readSettings() {
    return readJson(this.settingsPath, {});
  }

  #resolveTarget({ settings, running, recents }) {
    const saved = inspectUnityProject(settings.targetPath);
    const savedRunning = saved ? running.find((item) => samePath(item.path, saved.path)) : null;
    if (savedRunning) return savedRunning;
    if (running.length === 1) return running[0];
    if (saved) return { path: saved.path, name: saved.name, source: 'saved', running: false };
    if (running[0]) return running[0];
    if (recents[0]) return { ...recents[0], source: recents[0].source || 'hub', running: false };
    return null;
  }
}

export function relativeUnityAssetPath({ projectName, group, title, fileName, viewKey, mapKey, extension }) {
  if (!UNITY_GROUPS.has(group)) throw bridgeError('UNITY_GROUP_INVALID', 'Unity send group is not supported.');
  const root = unityFolderName(projectName);
  const ext = group === 'models' ? '.glb' : imageExtension(extension || fileName, '.png');
  if (group === 'source') return joinUnityPath('Assets', root, 'Images', 'Source', safeUnityFileName(fileName, ext));
  if (group === 'generated') return joinUnityPath('Assets', root, 'Images', 'Generated', safeUnityFileName(fileName, ext));
  if (group === 'atlases') return joinUnityPath('Assets', root, 'Images', 'Atlases', safeUnityFileName(fileName, ext));
  if (group === 'models') return joinUnityPath('Assets', root, 'Models', safeUnityFileName(fileName, '.glb'));
  if (group === 'views') {
    if (!VIEW_KEYS.has(viewKey)) throw bridgeError('UNITY_GROUP_INVALID', 'Character Views must be sent as front, left, back, and right files.');
    return joinUnityPath('Assets', root, 'Images', 'Views', unityFolderName(title, 'views'), `${viewKey}${ext}`);
  }
  if (!MAP_KEYS.has(mapKey)) throw bridgeError('UNITY_GROUP_INVALID', 'Material maps need a known map key.');
  return joinUnityPath('Assets', root, 'Images', 'Materials', unityFolderName(title, 'material'), `${mapKey}${ext}`);
}

export function resolveUnityAssetDestination(unityProjectPath, relativeAssetPath) {
  if (typeof relativeAssetPath !== 'string' || relativeAssetPath.includes('\0')) return null;
  const normalized = relativeAssetPath.replace(/\\/g, '/');
  if (!normalized.startsWith('Assets/') || normalized.split('/').some((part) => part === '.' || part === '..' || !part)) return null;
  const assetsRoot = path.resolve(unityProjectPath, 'Assets');
  return resolveWithin(assetsRoot, normalized.slice('Assets/'.length).replaceAll('/', path.sep));
}

export function inspectUnityProject(projectPath) {
  if (typeof projectPath !== 'string' || !projectPath.trim()) return null;
  const resolved = path.resolve(projectPath.trim());
  const assets = path.join(resolved, 'Assets');
  const settings = path.join(resolved, 'ProjectSettings');
  if (!existsSync(assets) || !existsSync(settings)) return null;
  const versionFile = path.join(settings, 'ProjectVersion.txt');
  const editorVersion = existsSync(versionFile) ? readUnityVersionSync(versionFile) : '';
  return { path: resolved, name: path.basename(resolved), editorVersion };
}

export function parseUnityProjectPathFromCommandLine(commandLine) {
  if (typeof commandLine !== 'string' || !commandLine) return null;
  const quoted = /-projectpath\s+"([^"]+)"/i.exec(commandLine);
  if (quoted?.[1]) return quoted[1];
  const unquoted = /-projectpath\s+(\S+)/i.exec(commandLine);
  return unquoted?.[1]?.replace(/^"+|"+$/g, '') || null;
}

export function parseHubProjects(payload, source = 'hub') {
  const collected = [];
  visitHubProjects(payload, (project) => {
    const projectPath = project.path || project.projectPath || project.dir || project.fullPath;
    if (typeof projectPath !== 'string' || !projectPath) return;
    collected.push({
      path: path.resolve(projectPath),
      name: project.title || project.name || path.basename(projectPath),
      lastModified: project.lastOpened || project.lastModified || project.timestamp || null,
      source,
      running: false,
    });
  });
  const seen = new Set();
  return collected.filter((project) => {
    const key = project.path.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseHubEditors(payload) {
  const editors = [];
  visitValues(payload, (value) => {
    if (!value || typeof value !== 'object') return;
    const location = Array.isArray(value.location) ? value.location[0] : value.location || value.executable || value.path;
    const version = value.version || value.m_Version;
    if (typeof location === 'string' && /unity\.exe$/i.test(location)) editors.push({ version: version || '', path: location });
  });
  return editors;
}

export function ensureGltfImporter(manifest, editorVersion) {
  const dependencies = { ...(manifest?.dependencies || {}) };
  const existing = GLTF_PACKAGE_IDS.find((id) => dependencies[id]);
  if (existing) return { manifest, added: false, packageId: existing };
  const packageId = 'com.unity.cloud.gltfast';
  const major = Number(String(editorVersion || '').split('.')[0]);
  dependencies[packageId] = major >= 6000 ? '6.10.1' : '5.2.0';
  return { manifest: { ...manifest, dependencies }, added: true, packageId };
}

export function parseModelKey(value) {
  if (typeof value !== 'string') return '';
  const match = /(?:^|\/)(tripo-[a-z0-9._-]+\.glb)$/i.exec(value);
  return match?.[1] || '';
}

function joinUnityPath(...parts) {
  return parts.filter(Boolean).join('/');
}

function toastMessage(folder, copies, gltFastAdded, launched) {
  const copied = `Copied to ${folder}`;
  if (gltFastAdded) return `${copied} · added glTFast so Unity can import GLB`;
  if (launched) return `${copied} · opening Unity`;
  return copies.some((item) => item.kind === 'model') ? `${copied} · placing on the open scene` : copied;
}

function samePath(left, right) {
  return path.resolve(left || '').toLowerCase() === path.resolve(right || '').toLowerCase();
}

function visitHubProjects(value, visit) {
  if (!value) return;
  if (Array.isArray(value)) {
    value.forEach((item) => visitHubProjects(item, visit));
    return;
  }
  if (typeof value !== 'object') return;
  if (value.path || value.projectPath || value.dir || value.fullPath) visit(value);
  if (value.projects) visitHubProjects(value.projects, visit);
  if (value.data) visitHubProjects(value.data, visit);
  for (const [key, child] of Object.entries(value)) {
    if (['projects', 'data', 'path', 'projectPath', 'dir', 'fullPath', 'title', 'name'].includes(key)) continue;
    if (typeof key === 'string' && (key.includes('\\') || key.includes('/') || key.endsWith('.json'))) {
      visit({ path: key, ...(child && typeof child === 'object' ? child : {}) });
    } else {
      visitHubProjects(child, visit);
    }
  }
}

function visitValues(value, visit) {
  visit(value);
  if (Array.isArray(value)) value.forEach((item) => visitValues(item, visit));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => visitValues(item, visit));
}

function readUnityVersionSync(filePath) {
  try {
    return /m_EditorVersion:\s*(\S+)/.exec(readFileSync(filePath, 'utf8'))?.[1] || '';
  } catch {
    return '';
  }
}

async function listHubProjects(env, platform) {
  const files = hubProjectFiles(env, platform);
  const projects = [];
  for (const filePath of files) {
    const payload = await readJson(filePath, null);
    if (payload) projects.push(...parseHubProjects(payload));
  }
  return projects.filter((project) => inspectUnityProject(project.path));
}

function hubProjectFiles(env, platform) {
  const appData = env.APPDATA || (platform === 'darwin'
    ? path.join(env.HOME || os.homedir(), 'Library', 'Application Support')
    : path.join(env.HOME || os.homedir(), '.config'));
  const hubDir = path.join(appData, 'UnityHub');
  return [
    path.join(hubDir, 'projects-v1.json'),
    path.join(hubDir, 'projects.json'),
    path.join(hubDir, 'projectDir.json'),
  ];
}

async function resolveEditorExecutable(project, env, platform) {
  const files = hubEditorFiles(env, platform);
  const editors = [];
  for (const filePath of files) {
    const payload = await readJson(filePath, null);
    if (payload) editors.push(...parseHubEditors(payload));
  }
  const match = editors.find((editor) => project.editorVersion && editor.version.startsWith(project.editorVersion.split('.')[0]));
  const versionMatch = editors.find((editor) => project.editorVersion && editor.version.startsWith(project.editorVersion));
  return versionMatch?.path || match?.path || editors[0]?.path || null;
}

function hubEditorFiles(env, platform) {
  const appData = env.APPDATA || (platform === 'darwin'
    ? path.join(env.HOME || os.homedir(), 'Library', 'Application Support')
    : path.join(env.HOME || os.homedir(), '.config'));
  return [path.join(appData, 'UnityHub', 'editors.json')];
}

async function listUnityProcesses(platform) {
  if (platform === 'win32') {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Get-CimInstance Win32_Process -Filter "Name = \'Unity.exe\'" | Select-Object ProcessId, CommandLine, ExecutablePath | ConvertTo-Json -Compress',
    ], { windowsHide: true, timeout: 8000 });
    return parseProcessJson(stdout);
  }
  const { stdout } = await execFileAsync('ps', ['-ax', '-o', 'pid=,command='], { timeout: 8000 });
  return stdout.split(/\r?\n/).flatMap((line) => {
    const match = /^\s*(\d+)\s+(.+)$/.exec(line);
    if (!match || !/-projectpath/i.test(match[2])) return [];
    return [{ pid: Number(match[1]), commandLine: match[2], executable: null }];
  });
}

function parseProcessJson(stdout) {
  const trimmed = String(stdout || '').trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed);
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows.flatMap((row) => {
    const pid = Number(row.ProcessId || row.pid);
    const commandLine = row.CommandLine || row.commandLine || '';
    if (!pid || !commandLine) return [];
    return [{ pid, commandLine, executable: row.ExecutablePath || null }];
  });
}

async function focusUnityWindow(pid, platform) {
  if (!pid || platform !== 'win32') return false;
  const script = `Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class ConseptFocus {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hWnd);
  public static bool Focus(int pid) {
    bool found = false;
    EnumWindows((hWnd, lParam) => {
      uint windowPid;
      GetWindowThreadProcessId(hWnd, out windowPid);
      if (windowPid == pid && IsWindowVisible(hWnd)) {
        ShowWindow(hWnd, 9);
        SetForegroundWindow(hWnd);
        found = true;
        return false;
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
"@
[ConseptFocus]::Focus(${Number(pid)})`;
  await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 8000 });
  return true;
}

async function launchUnityEditor(editorPath, projectPath) {
  const { spawn } = await import('node:child_process');
  const child = spawn(editorPath, ['-projectPath', projectPath], { detached: true, stdio: 'ignore', windowsHide: false });
  child.unref();
}

function bridgeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
