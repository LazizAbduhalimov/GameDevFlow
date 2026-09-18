import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { unityFolderName, safeUnityFileName, resolveWithin } from '../../server/path-safety.mjs';
import {
  UnityBridge,
  ensureGltfImporter,
  inspectUnityProject,
  parseHubEditors,
  parseHubProjects,
  parseModelKey,
  parseUnityProjectPathFromCommandLine,
  relativeUnityAssetPath,
  resolveUnityAssetDestination,
} from '../../server/unity-bridge.mjs';

test('Unity folder names keep the Consept project title and strip illegal characters', () => {
  assert.equal(unityFolderName('Zombie Knight'), 'Zombie Knight');
  assert.equal(unityFolderName('  Hero <>:"/\\|?*  '), 'Hero');
  assert.equal(unityFolderName('...'), 'Consept');
  assert.equal(safeUnityFileName('orange collared shirt.png', '.png'), 'orange collared shirt.png');
  assert.equal(safeUnityFileName('tripo-model.glb', '.glb'), 'tripo-model.glb');
});

test('Unity asset grouping stays inside Assets/<project>/ with logical subfolders', () => {
  assert.equal(relativeUnityAssetPath({ projectName: 'Zombie Knight', group: 'source', fileName: 'hero.png' }), 'Assets/Zombie Knight/Images/Source/hero.png');
  assert.equal(relativeUnityAssetPath({ projectName: 'Zombie Knight', group: 'generated', fileName: 'hero-front.png' }), 'Assets/Zombie Knight/Images/Generated/hero-front.png');
  assert.equal(relativeUnityAssetPath({ projectName: 'Zombie Knight', group: 'views', title: 'Character views', viewKey: 'front', fileName: 'front.png' }), 'Assets/Zombie Knight/Images/Views/Character views/front.png');
  assert.equal(relativeUnityAssetPath({ projectName: 'Zombie Knight', group: 'atlases', fileName: 'sheet.png' }), 'Assets/Zombie Knight/Images/Atlases/sheet.png');
  assert.equal(relativeUnityAssetPath({ projectName: 'Zombie Knight', group: 'materials', title: 'Armor', mapKey: 'normal', fileName: 'normal.png' }), 'Assets/Zombie Knight/Images/Materials/Armor/normal.png');
  assert.equal(relativeUnityAssetPath({ projectName: 'Zombie Knight', group: 'models', fileName: 'tripo-abc.glb' }), 'Assets/Zombie Knight/Models/tripo-abc.glb');
  assert.throws(() => relativeUnityAssetPath({ projectName: 'Zombie Knight', group: 'secret', fileName: 'x.png' }), { code: 'UNITY_GROUP_INVALID' });
  assert.throws(() => relativeUnityAssetPath({ projectName: 'Zombie Knight', group: 'views', title: 'Hero', viewKey: 'top', fileName: 'x.png' }), { code: 'UNITY_GROUP_INVALID' });
});

test('Unity destinations refuse path traversal and stay under Assets', () => {
  const root = path.join(os.tmpdir(), 'consept-unity-root');
  assert.ok(resolveUnityAssetDestination(root, 'Assets/Zombie Knight/Models/hero.glb')?.endsWith(path.join('Assets', 'Zombie Knight', 'Models', 'hero.glb')));
  assert.equal(resolveUnityAssetDestination(root, 'Assets/../ProjectSettings/secret.json'), null);
  assert.equal(resolveUnityAssetDestination(root, 'Assets/foo/../../outside.png'), null);
  assert.equal(resolveUnityAssetDestination(root, 'Temp/Consept/command.json'), null);
  assert.equal(resolveWithin(root, path.join('Temp', 'Consept', 'command.json')), path.join(root, 'Temp', 'Consept', 'command.json'));
});

test('Unity process and Hub parsers extract project paths', () => {
  assert.equal(parseUnityProjectPathFromCommandLine('Unity.exe -projectpath "C:\\Games\\Arena" -batchmode'), 'C:\\Games\\Arena');
  assert.equal(parseUnityProjectPathFromCommandLine('Unity.exe -projectPath C:\\Games\\Arena'), 'C:\\Games\\Arena');
  assert.equal(parseUnityProjectPathFromCommandLine('Unity.exe -quit'), null);
  const projects = parseHubProjects({
    data: {
      projects: {
        'C:\\Games\\Arena': { title: 'Arena', lastOpened: 10 },
      },
    },
  });
  assert.equal(projects[0].name, 'Arena');
  assert.ok(projects[0].path.toLowerCase().endsWith(path.join('Games', 'Arena').toLowerCase()));
  const editors = parseHubEditors({
    official: [{ version: '6000.0.23f1', location: ['C:\\Program Files\\Unity\\Hub\\Editor\\6000.0.23f1\\Editor\\Unity.exe'] }],
  });
  assert.equal(editors[0].version, '6000.0.23f1');
  assert.equal(parseModelKey('/data/models/tripo-879f66bb-c07e-4c20-aa0d-1fbbc47e9d2f-ab931d27.glb'), 'tripo-879f66bb-c07e-4c20-aa0d-1fbbc47e9d2f-ab931d27.glb');
  assert.equal(parseModelKey('https://example.com/evil.glb'), '');
});

test('glTFast is added only when the Unity project has no glTF importer', () => {
  const added = ensureGltfImporter({ dependencies: { 'com.unity.modules.ai': '1.0.0' } }, '6000.0.23f1');
  assert.equal(added.added, true);
  assert.equal(added.manifest.dependencies['com.unity.cloud.gltfast'], '6.10.1');
  const older = ensureGltfImporter({ dependencies: {} }, '2022.3.21f1');
  assert.equal(older.manifest.dependencies['com.unity.cloud.gltfast'], '5.2.0');
  const existing = ensureGltfImporter({ dependencies: { 'org.khronos.unitygltf': '2.0.0' } }, '6000.0.23f1');
  assert.equal(existing.added, false);
});

test('Unity send copies grouped files, overwrites in place, and refuses destinations outside Assets', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'consept-unity-'));
  const unityProject = path.join(root, 'Arena');
  const sourceDir = path.join(root, 'consept');
  const settingsPath = path.join(root, 'unity.json');
  const editorScriptPath = path.join(root, 'ConseptUnityBridge.cs');
  await mkdir(path.join(unityProject, 'Assets'), { recursive: true });
  await mkdir(path.join(unityProject, 'ProjectSettings'), { recursive: true });
  await mkdir(path.join(unityProject, 'Packages'), { recursive: true });
  await writeFile(path.join(unityProject, 'ProjectSettings', 'ProjectVersion.txt'), 'm_EditorVersion: 6000.0.23f1\n');
  await writeFile(path.join(unityProject, 'Packages', 'manifest.json'), `${JSON.stringify({ dependencies: { 'com.unity.modules.ui': '1.0.0' } }, null, 2)}\n`);
  await writeFile(editorScriptPath, 'static class ConseptUnityBridge {}\n');
  const imagePath = path.join(sourceDir, 'hero.png');
  const modelPath = path.join(sourceDir, 'tripo-model.glb');
  await mkdir(sourceDir, { recursive: true });
  await writeFile(imagePath, 'png');
  await writeFile(modelPath, 'glb-one');

  const bridge = new UnityBridge({
    settingsPath,
    editorScriptPath,
    listProcesses: async () => [],
    focusProcess: async () => true,
    launchEditor: async () => {},
  });

  const first = await bridge.send({
    projectName: 'Zombie Knight',
    placeOnScene: true,
    projectPath: unityProject,
    focus: false,
    launch: false,
    items: [
      { group: 'generated', sourcePath: imagePath, fileName: 'hero.png', title: 'Hero' },
      { group: 'models', sourcePath: modelPath, fileName: 'tripo-model.glb', title: 'Hero model' },
    ],
  });

  const imageDest = path.join(unityProject, 'Assets', 'Zombie Knight', 'Images', 'Generated', 'hero.png');
  const modelDest = path.join(unityProject, 'Assets', 'Zombie Knight', 'Models', 'tripo-model.glb');
  assert.equal(await readFile(imageDest, 'utf8'), 'png');
  assert.equal(await readFile(modelDest, 'utf8'), 'glb-one');
  assert.equal(await readFile(path.join(unityProject, 'Assets', 'Consept', 'Editor', 'ConseptUnityBridge.cs'), 'utf8'), 'static class ConseptUnityBridge {}\n');
  assert.match(await readFile(path.join(unityProject, 'Packages', 'manifest.json'), 'utf8'), /com\.unity\.cloud\.gltfast/);
  assert.equal(first.gltFastAdded, true);
  assert.deepEqual(first.copied, [
    'Assets/Zombie Knight/Images/Generated/hero.png',
    'Assets/Zombie Knight/Models/tripo-model.glb',
  ]);
  const command = JSON.parse(await readFile(path.join(unityProject, 'Temp', 'Consept', 'command.json'), 'utf8'));
  assert.equal(command.placeOnScene, true);
  assert.equal(command.assets[1].kind, 'model');

  await writeFile(modelPath, 'glb-two');
  await bridge.send({
    projectName: 'Zombie Knight',
    placeOnScene: true,
    projectPath: unityProject,
    focus: false,
    launch: false,
    items: [{ group: 'models', sourcePath: modelPath, fileName: 'tripo-model.glb', title: 'Hero model' }],
  });
  assert.equal(await readFile(modelDest, 'utf8'), 'glb-two');

  assert.equal(inspectUnityProject(unityProject)?.name, 'Arena');
  assert.equal(inspectUnityProject(root), null);

  await assert.rejects(
    () => bridge.send({
      projectName: 'Zombie Knight',
      projectPath: unityProject,
      focus: false,
      launch: false,
      items: [{ group: 'generated', sourcePath: path.join(root, 'missing.png'), fileName: 'missing.png', title: 'Missing' }],
    }),
    { code: 'UNITY_SOURCE_MISSING' },
  );

  await rm(root, { recursive: true, force: true });
});
