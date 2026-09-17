import assert from 'node:assert/strict';
import test from 'node:test';
import { fallbackGroup, groupingSchema, normalizeDetectedItems, normalizeGroups, uiSheetDetectionSchema } from '../../server/smart-separation.mjs';

test('smart separation normalizes source identity and clamps vision bounds', () => {
  const items = normalizeDetectedItems({ items: [{ name: '  Play   button ', role: 'button', description: 'Primary action', bounds: { x: -40, y: 920, width: 400, height: 300 } }] }, {
    sourceIndex: 2,
    sourceUrl: '/data/assets/ui.png',
    sourceAssetId: 'asset-ui',
    itemOffset: 0,
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].name, 'Play button');
  assert.equal(items[0].sourceIndex, 2);
  assert.deepEqual(items[0].bounds, { x: 0, y: 920, width: 400, height: 80 });
  assert.equal(items[0].enabled, true);
});

test('smart separation groups each item once and keeps unassigned items reviewable', () => {
  const items = [
    { id: 'a', name: 'Play', role: 'button' },
    { id: 'b', name: 'Coin', role: 'icon' },
    { id: 'c', name: 'Banner', role: 'banner' },
  ];
  const groups = normalizeGroups({ groups: [
    { name: 'Controls', slug: 'controls', itemIds: ['a', 'a', 'missing'], reasoning: 'Interactive controls' },
    { name: 'Icons', slug: 'icons', itemIds: ['b'], reasoning: 'Small symbols' },
  ] }, items);
  assert.equal(groups.length, 3);
  assert.equal(items[0].groupId, groups[0].id);
  assert.equal(items[1].groupId, groups[1].id);
  assert.equal(groups[2].slug, 'unsorted');
  assert.equal(items[2].groupId, groups[2].id);
});

test('smart separation fallback retains all detected items', () => {
  const items = [{ id: 'one' }, { id: 'two' }];
  const groups = fallbackGroup(items);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].slug, 'unsorted');
  assert.ok(items.every((item) => item.groupId === groups[0].id));
});

test('smart separation schemas constrain structured Codex output', () => {
  assert.equal(uiSheetDetectionSchema.additionalProperties, false);
  const schema = groupingSchema(['first', 'second']);
  assert.deepEqual(schema.properties.groups.items.properties.itemIds.items.enum, ['first', 'second']);
});
