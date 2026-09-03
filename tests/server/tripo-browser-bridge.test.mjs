import assert from 'node:assert/strict';
import test from 'node:test';
import { extractTripoResult, isAllowedTripoDownloadUrl, looksLikeTripoModelUrl, looksLikeTripoResultModelUrl } from '../../server/tripo-browser-bridge.mjs';

test('Tripo task payload prefers the PBR GLB and retains progress metadata', () => {
  const result = extractTripoResult({
    code: 0,
    data: {
      task_id: 'task-123',
      status: 'success',
      progress: 100,
      output: {
        base_model: 'https://tripo-data.s3-accelerate.amazonaws.com/output/base.glb?sig=1',
        pbr_model: 'https://tripo-data.s3-accelerate.amazonaws.com/output/pbr.glb?sig=2',
        rendered_image: 'https://tripo-data.s3-accelerate.amazonaws.com/output/preview.png?sig=3',
      },
    },
  });

  assert.equal(result.taskId, 'task-123');
  assert.equal(result.status, 'success');
  assert.equal(result.progress, 100);
  assert.equal(result.modelUrls[0], 'https://tripo-data.s3-accelerate.amazonaws.com/output/pbr.glb?sig=2');
  assert.deepEqual(result.previewUrls, ['https://tripo-data.s3-accelerate.amazonaws.com/output/preview.png?sig=3']);
});

test('Tripo model URL checks accept model responses but reject unrelated files and hosts', () => {
  assert.equal(looksLikeTripoModelUrl('https://cdn.tripo3d.ai/result/model.glb?token=short'), true);
  assert.equal(looksLikeTripoModelUrl('https://cdn.tripo3d.ai/download?id=1', 'model/gltf-binary'), true);
  assert.equal(looksLikeTripoModelUrl('https://cdn.tripo3d.ai/result/preview.png'), false);
  assert.equal(isAllowedTripoDownloadUrl('https://tripo-data.s3-accelerate.amazonaws.com/a.glb'), true);
  assert.equal(isAllowedTripoDownloadUrl('https://tripo-data.rg1.data.tripo3d.com/output/a.glb'), true);
  assert.equal(isAllowedTripoDownloadUrl('https://example.com/a.glb'), false);
  assert.equal(looksLikeTripoResultModelUrl('https://studio.tripo3d.ai/viewer/cp-lp.glb'), false);
  assert.equal(looksLikeTripoResultModelUrl('https://tripo-data.rg1.data.tripo3d.com/tripo-studio/20260903/id/tripo_model_id_meshopt.glb?sig=1'), true);
});

test('Tripo task payload accepts signed model endpoints without a file extension', () => {
  const result = extractTripoResult({ data: { task_id: 'task-no-ext', status: 'success', output: { pbr_model: 'https://api.tripo3d.ai/v2/download/model?token=short' } } });
  assert.deepEqual(result.modelUrls, ['https://api.tripo3d.ai/v2/download/model?token=short']);
});
