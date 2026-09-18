import assert from 'node:assert/strict';
import test from 'node:test';
import { characterPropsDetectionSchema, MAX_CHARACTER_PARTS, normalizeCharacterProps } from '../../server/character-parts.mjs';

test('character props analysis keeps unique short names and descriptions', () => {
  const result = normalizeCharacterProps({
    characterDescription: '  A scout in  grey armor  ',
    parts: [
      { name: '  head  ', description: 'Bald head, comms earpiece' },
      { name: 'Head', description: 'duplicate' },
      { name: '', description: 'ignored' },
      { name: 'right boot', description: 'Olive combat boot' },
    ],
  });
  assert.equal(result.characterDescription, 'A scout in grey armor');
  assert.equal(result.parts.length, 2);
  assert.equal(result.parts[0].name, 'head');
  assert.equal(result.parts[0].enabled, true);
  assert.match(result.parts[0].id, /^part-head-/);
  assert.equal(result.parts[1].name, 'right boot');
});

test('character props schema forbids extra fields and caps the list', () => {
  assert.equal(characterPropsDetectionSchema.additionalProperties, false);
  assert.equal(characterPropsDetectionSchema.properties.parts.maxItems, MAX_CHARACTER_PARTS);
  const overflow = normalizeCharacterProps({
    characterDescription: '',
    parts: Array.from({ length: MAX_CHARACTER_PARTS + 4 }, (_, index) => ({ name: `Part ${index + 1}`, description: '' })),
  });
  assert.equal(overflow.parts.length, MAX_CHARACTER_PARTS);
});
