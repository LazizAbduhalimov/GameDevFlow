import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

export function validateUploadedGlb(bytes) {
  const invalid = () => { throw new Error('Choose a complete GLB 2.0 model exported from Tripo.'); };
  if (!Buffer.isBuffer(bytes) || bytes.length < 24 || bytes.toString('ascii', 0, 4) !== 'glTF'
    || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) invalid();
  let document;
  let binaryLength = 0;
  let offset = 12;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) invalid();
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    if (length % 4 || offset + 8 + length > bytes.length) invalid();
    if (offset === 12) {
      if (type !== 0x4e4f534a) invalid();
      try { document = JSON.parse(bytes.toString('utf8', offset + 8, offset + 8 + length)); } catch { invalid(); }
    } else if (type === 0x004e4942) {
      if (binaryLength || offset !== 20 + bytes.readUInt32LE(12)) invalid();
      binaryLength = length;
    } else if (type === 0x4e4f534a) invalid();
    offset += 8 + length;
  }
  if (document?.asset?.version !== '2.0') invalid();
  for (const key of ['buffers', 'images']) {
    if (document[key] !== undefined && !Array.isArray(document[key])) invalid();
    for (const item of document[key] || []) {
      if (!item || typeof item !== 'object') invalid();
      if (item.uri !== undefined && (typeof item.uri !== 'string' || !/^data:/i.test(item.uri))) {
        throw new Error('Export a self-contained GLB with embedded textures; external files are not supported.');
      }
    }
  }
  for (const [index, buffer] of (document.buffers || []).entries()) {
    if (!Number.isInteger(buffer.byteLength) || buffer.byteLength < 1) invalid();
    // Meshopt GLBs may declare an uncompressed placeholder buffer without a
    // URI. Its data is reconstructed by the decoder, not stored in the BIN chunk.
    const meshoptFallback = index > 0
      && (buffer.extensions?.EXT_meshopt_compression?.fallback === true || document.extensionsRequired?.includes('EXT_meshopt_compression'))
      && Array.isArray(document.bufferViews)
      && document.bufferViews.filter((view) => view.buffer === index).every((view) => view.extensions?.EXT_meshopt_compression)
      && document.bufferViews.every((view) => view.extensions?.EXT_meshopt_compression?.buffer !== index);
    if (buffer.uri === undefined && !meshoptFallback && (index !== 0 || buffer.byteLength > binaryLength || binaryLength - buffer.byteLength > 3)) invalid();
  }
  return document;
}

export async function saveUploadedModel({ buffer, originalName, projectId, modelsDir }) {
  validateUploadedGlb(buffer);
  const modelKey = `tripo-import-${randomUUID()}.glb`;
  await writeFile(path.join(modelsDir, modelKey), buffer, { flag: 'wx' });
  const fileName = String(originalName || 'Tripo model.glb').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 180) || 'Tripo model.glb';
  return {
    projectId, fileName, modelKey,
    modelUrl: `/data/models/${modelKey}`,
    downloadUrl: `/api/integrations/tripo/models/${modelKey}/download`,
  };
}
