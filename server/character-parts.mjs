import { randomUUID } from 'node:crypto';

export const MAX_CHARACTER_PARTS = 24;

export const characterPropsDetectionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['characterDescription', 'parts'],
  properties: {
    characterDescription: { type: 'string', maxLength: 800 },
    parts: {
      type: 'array',
      maxItems: MAX_CHARACTER_PARTS,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'description'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 80 },
          description: { type: 'string', maxLength: 400 },
        },
      },
    },
  },
};

export function normalizeCharacterProps(payload) {
  const characterDescription = cleanText(payload?.characterDescription, '', 800);
  const seen = new Set();
  const parts = [];
  for (const raw of Array.isArray(payload?.parts) ? payload.parts : []) {
    const name = cleanText(raw?.name, '', 80);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    parts.push({
      id: `part-${slug(name)}-${randomUUID().slice(0, 8)}`,
      name,
      description: cleanText(raw?.description, '', 400),
      enabled: true,
    });
    if (parts.length >= MAX_CHARACTER_PARTS) break;
  }
  return { characterDescription, parts };
}

function cleanText(value, fallback, maxLength) {
  const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  return (text || fallback).slice(0, maxLength);
}

function slug(value) {
  return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'part';
}
