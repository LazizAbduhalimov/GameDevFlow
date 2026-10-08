import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { saveUploadedModel, validateUploadedGlb } from '../../server/model-upload.mjs';

function glb(document = { asset: { version: '2.0' } }, bin = null) {
  let json = Buffer.from(JSON.stringify(document));
  json = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)]);
  const bytes = Buffer.alloc(20 + json.length + (bin ? 8 + bin.length : 0));
  bytes.write('glTF'); bytes.writeUInt32LE(2, 4); bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(json.length, 12); bytes.writeUInt32LE(0x4e4f534a, 16); json.copy(bytes, 20);
  if (bin) { bytes.writeUInt32LE(bin.length, 20 + json.length); bytes.writeUInt32LE(0x004e4942, 24 + json.length); bin.copy(bytes, 28 + json.length); }
  return bytes;
}

test('accepts embedded GLB and preserves meshopt metadata', () => {
  const doc = { asset: { version: '2.0' }, buffers: [{ byteLength: 3 }], images: [{ uri: 'data:image/png;base64,AA==' }], extensionsUsed: ['EXT_meshopt_compression'] };
  assert.deepEqual(validateUploadedGlb(glb(doc, Buffer.alloc(4))), doc);
});

test('rejects renamed text files, truncated GLB, wrong versions and mismatched chunks', () => {
  assert.throws(() => validateUploadedGlb(Buffer.from('<html>not a model</html>')));
  const valid = glb();
  assert.throws(() => validateUploadedGlb(valid.subarray(0, valid.length - 1)));
  const wrongVersion = Buffer.from(valid); wrongVersion.writeUInt32LE(1, 4);
  assert.throws(() => validateUploadedGlb(wrongVersion));
  const badChunk = Buffer.from(valid); badChunk.writeUInt32LE(99999, 12);
  assert.throws(() => validateUploadedGlb(badChunk));
  assert.throws(() => validateUploadedGlb(glb({ asset: { version: '1.0' } })));
});

test('requires embedded resources and bounds the binary buffer', () => {
  for (const uri of ['https://example.com/model.bin', '../model.bin', '//example.com/texture.png', 'file:///etc/passwd']) {
    assert.throws(() => validateUploadedGlb(glb({ asset: { version: '2.0' }, images: [{ uri }] })), /embedded/);
  }
  assert.throws(() => validateUploadedGlb(glb({ asset: { version: '2.0' }, buffers: [{ byteLength: 99 }] }, Buffer.alloc(4))));
  assert.throws(() => validateUploadedGlb(glb({ asset: { version: '2.0' }, buffers: [{ byteLength: 4 }] })));
});

test('accepts meshopt placeholder buffers used by real Tripo GLBs', () => {
  const document = {
    asset: { version: '2.0' }, extensionsRequired: ['EXT_meshopt_compression'],
    buffers: [{ byteLength: 4 }, { byteLength: 32, extensions: { EXT_meshopt_compression: { fallback: true } } }],
    bufferViews: [{ buffer: 1, byteLength: 32, extensions: { EXT_meshopt_compression: { buffer: 0 } } }],
  };
  assert.deepEqual(validateUploadedGlb(glb(document, Buffer.alloc(4))), document);
  document.bufferViews[0].extensions.EXT_meshopt_compression.buffer = 1;
  assert.throws(() => validateUploadedGlb(glb(document, Buffer.alloc(4))));
});

test('stores imports under unique safe keys and returns the active project and original bytes', async () => {
  const modelsDir = await mkdtemp(path.join(os.tmpdir(), 'consept-model-upload-'));
  try {
    const buffer = glb();
    const first = await saveUploadedModel({ buffer, originalName: '../../my model.glb', projectId: 'project-a', modelsDir });
    const second = await saveUploadedModel({ buffer, originalName: 'my model.glb', projectId: 'project-b', modelsDir });
    assert.equal(first.fileName, 'my model.glb');
    assert.equal(first.projectId, 'project-a');
    assert.match(first.modelKey, /^tripo-import-[a-f0-9-]+\.glb$/);
    assert.notEqual(first.modelKey, second.modelKey);
    assert.deepEqual(await readFile(path.join(modelsDir, first.modelKey)), buffer);
    assert.equal(first.modelUrl, `/data/models/${first.modelKey}`);
    assert.equal(first.downloadUrl, `/api/integrations/tripo/models/${first.modelKey}/download`);
  } finally { await rm(modelsDir, { recursive: true, force: true }); }
});
