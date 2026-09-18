import type { CharacterPartCandidate, CharacterPartsNodeData } from './types';

export const MAX_CHARACTER_PARTS = 24;
export const CHARACTER_PART_HANDLE_PREFIX = 'part:';

export function characterPartHandle(partId: string) {
  return `${CHARACTER_PART_HANDLE_PREFIX}${partId}`;
}

export function parseCharacterPartHandle(handle?: string | null) {
  if (!handle?.startsWith(CHARACTER_PART_HANDLE_PREFIX)) return '';
  return handle.slice(CHARACTER_PART_HANDLE_PREFIX.length);
}

export function createCharacterPart(input: { name?: string; description?: string; enabled?: boolean; id?: string } = {}): CharacterPartCandidate {
  const name = cleanPartName(input.name, 'Part');
  return {
    id: input.id || `part-${crypto.randomUUID()}`,
    name,
    description: cleanPartText(input.description, 400),
    enabled: input.enabled !== false,
  };
}

export function normalizeCharacterPart(value: unknown): CharacterPartCandidate | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const name = cleanPartName(record.name || record.title, '');
  if (!name) return null;
  const id = typeof record.id === 'string' && record.id.trim() ? record.id.trim().slice(0, 80) : `part-${slugPartName(name)}`;
  return {
    id,
    name,
    description: cleanPartText(record.description, 400),
    enabled: record.enabled !== false,
    spawnedNodeId: typeof record.spawnedNodeId === 'string' && record.spawnedNodeId.trim() ? record.spawnedNodeId.trim() : undefined,
  };
}

export function normalizeCharacterPartsList(value: unknown): CharacterPartCandidate[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const parts: CharacterPartCandidate[] = [];
  for (const entry of value) {
    const part = normalizeCharacterPart(entry);
    if (!part || seen.has(part.id)) continue;
    seen.add(part.id);
    parts.push(part);
    if (parts.length >= MAX_CHARACTER_PARTS) break;
  }
  return parts;
}

export function createCharacterPartsData(overrides: Partial<CharacterPartsNodeData> = {}): CharacterPartsNodeData {
  return {
    title: overrides.title || 'Character Parts',
    notes: overrides.notes || '',
    status: overrides.status || 'idle',
    characterDescription: overrides.characterDescription || '',
    provider: overrides.provider || 'global',
    parts: normalizeCharacterPartsList(overrides.parts),
  };
}

export function selectedCharacterParts(parts: CharacterPartCandidate[]) {
  return parts.filter((part) => part.enabled);
}

export function setCharacterPartEnabled(parts: CharacterPartCandidate[], partId: string, enabled: boolean) {
  return parts.map((part) => part.id === partId ? { ...part, enabled } : part);
}

export function toggleCharacterPart(parts: CharacterPartCandidate[], partId: string) {
  return parts.map((part) => part.id === partId ? { ...part, enabled: !part.enabled } : part);
}

export function setAllCharacterPartsEnabled(parts: CharacterPartCandidate[], enabled: boolean) {
  return parts.map((part) => ({ ...part, enabled }));
}

export function patchCharacterPart(parts: CharacterPartCandidate[], partId: string, patch: Partial<CharacterPartCandidate>) {
  return parts.map((part) => {
    if (part.id !== partId) return part;
    const name = patch.name === undefined ? part.name : cleanPartName(patch.name, part.name);
    return {
      ...part,
      ...patch,
      name,
      description: patch.description === undefined ? part.description : cleanPartText(patch.description, 400),
    };
  });
}

export function addCharacterPart(parts: CharacterPartCandidate[], input: { name?: string; description?: string } = {}) {
  if (parts.length >= MAX_CHARACTER_PARTS) return parts;
  const index = parts.length + 1;
  return [...parts, createCharacterPart({
    name: input.name || `Part ${index}`,
    description: input.description,
    enabled: true,
  })];
}

export function removeCharacterPart(parts: CharacterPartCandidate[], partId: string) {
  return parts.filter((part) => part.id !== partId);
}

export function characterPartsInputError(sourceCount: number) {
  return sourceCount === 1 || sourceCount === 4 ? '' : 'Character Parts accepts one image or a complete four-image All Views output.';
}

export function buildPropIdentityPrompt(part: Pick<CharacterPartCandidate, 'name' | 'description'>, notes = '') {
  return [
    `Isolate only: ${part.name.trim() || 'this part'}.`,
    part.description.trim() ? part.description.trim() : '',
    'This is a standalone production turnaround of that single part or object. Do not include the rest of the character, clothing that is not this part, or any environment.',
    'Use a plain light studio background that clearly separates from the subject. Do not blend the subject into the background.',
    'Preserve exact materials, colors, silhouette and visible details from the attached character references.',
    notes.trim() ? `Project notes: ${notes.trim()}` : '',
  ].filter(Boolean).join('\n');
}

function cleanPartName(value: unknown, fallback: string) {
  return cleanPartText(value, 80) || fallback;
}

function cleanPartText(value: unknown, maxLength: number) {
  const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  return text.slice(0, maxLength);
}

function slugPartName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'part';
}
