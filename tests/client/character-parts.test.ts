import { describe, expect, it } from 'vitest';
import {
  addCharacterPart,
  buildPropIdentityPrompt,
  characterPartHandle,
  characterPartsInputError,
  createCharacterPart,
  createCharacterPartsData,
  MAX_CHARACTER_PARTS,
  normalizeCharacterPartsList,
  parseCharacterPartHandle,
  patchCharacterPart,
  removeCharacterPart,
  selectedCharacterParts,
  setAllCharacterPartsEnabled,
  toggleCharacterPart,
} from '../../src/character-parts';

describe('character parts list helpers', () => {
  it('creates enabled parts with stable handles', () => {
    const part = createCharacterPart({ name: '  Right boot  ', description: 'Rugged combat boot' });
    expect(part.name).toBe('Right boot');
    expect(part.enabled).toBe(true);
    expect(characterPartHandle(part.id)).toBe(`part:${part.id}`);
    expect(parseCharacterPartHandle(characterPartHandle(part.id))).toBe(part.id);
  });

  it('toggles, selects all, adds and removes parts', () => {
    let parts = [createCharacterPart({ name: 'head' }), createCharacterPart({ name: 'boot' })];
    parts = toggleCharacterPart(parts, parts[0].id);
    expect(selectedCharacterParts(parts).map((part) => part.name)).toEqual(['boot']);
    parts = setAllCharacterPartsEnabled(parts, true);
    expect(selectedCharacterParts(parts)).toHaveLength(2);
    parts = addCharacterPart(parts, { name: 'belt' });
    expect(parts.map((part) => part.name)).toEqual(['head', 'boot', 'belt']);
    parts = removeCharacterPart(parts, parts[1].id);
    expect(parts.map((part) => part.name)).toEqual(['head', 'belt']);
    parts = patchCharacterPart(parts, parts[0].id, { name: '  Bald head  ' });
    expect(parts[0].name).toBe('Bald head');
  });

  it('caps the list and ignores legacy record payloads', () => {
    const filled = Array.from({ length: MAX_CHARACTER_PARTS }, (_, index) => createCharacterPart({ name: `Part ${index + 1}` }));
    expect(addCharacterPart(filled)).toHaveLength(MAX_CHARACTER_PARTS);
    expect(normalizeCharacterPartsList({ hat: { title: 'Hat' } })).toEqual([]);
    expect(characterPartsInputError(4)).toBe('');
    expect(characterPartsInputError(2)).toMatch(/one image or a complete four-image/i);
  });

  it('starts empty for new Character Parts nodes', () => {
    expect(createCharacterPartsData().parts).toEqual([]);
    expect(createCharacterPartsData().status).toBe('idle');
  });

  it('builds an isolated prop identity prompt without pose language', () => {
    const prompt = buildPropIdentityPrompt({ name: 'right boot', description: 'Olive combat boot' }, 'Keep the buckles.');
    expect(prompt).toContain('Isolate only: right boot.');
    expect(prompt).toContain('Olive combat boot');
    expect(prompt).toContain('plain light studio background');
    expect(prompt).toContain('Keep the buckles.');
    expect(prompt).not.toMatch(/A-pose|T-pose|full-body/i);
  });
});
