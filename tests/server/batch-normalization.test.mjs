import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeBatchRequest } from '../../server/batch-normalization.mjs';

const sourceUrl = '/data/assets/ui-sheet';

test('smart-separation batches accept up to 128 regeneration slots', () => {
  const slots = Array.from({ length: 128 }, (_, index) => ({
    key: `element-${index + 1}`,
    prompt: `Regenerate UI element ${index + 1}`,
  }));

  const batch = normalizeBatchRequest({
    sourceUrl,
    kind: 'smart-separation',
    concurrency: 4,
    slots,
  });

  assert.equal(batch.batchKind, 'smart-separation');
  assert.equal(batch.concurrency, 4);
  assert.equal(batch.slots.length, 128);
  assert.equal(batch.slots[0].batchKind, 'smart-separation');
  assert.equal(batch.slots[127].slotKey, 'element-128');
  assert.equal(batch.slots[127].slotIndex, 127);
});

test('smart-separation rejects slot 129 without changing other batch limits', () => {
  assert.throws(() => normalizeBatchRequest({
    sourceUrl,
    kind: 'smart-separation',
    slots: Array.from({ length: 129 }, (_, index) => ({ prompt: `Element ${index + 1}` })),
  }), { code: 'BATCH_SLOT_COUNT', message: 'Smart Separation batches require one to 128 slots.' });

  assert.throws(() => normalizeBatchRequest({
    sourceUrl,
    kind: 'variants',
    slots: Array.from({ length: 7 }, (_, index) => ({ prompt: `Variant ${index + 1}` })),
  }), { code: 'BATCH_SLOT_COUNT', message: 'Variants batches require one to 6 slots.' });
});

test('unknown batch kinds remain rejected and concurrency stays limited to four', () => {
  assert.throws(() => normalizeBatchRequest({
    sourceUrl,
    kind: 'smart-separation-v2',
    slots: [{ prompt: 'Element' }],
  }), { code: 'UNSUPPORTED_BATCH_KIND' });

  assert.throws(() => normalizeBatchRequest({
    sourceUrl,
    kind: 'smart-separation',
    concurrency: 5,
    slots: [{ prompt: 'Element' }],
  }), { code: 'BATCH_CONCURRENCY' });
});
