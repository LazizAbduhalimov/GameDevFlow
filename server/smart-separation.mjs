import { randomUUID } from 'node:crypto';

export const MAX_SMART_SEPARATION_ITEMS = 128;
export const MAX_SMART_SEPARATION_GROUPS = 32;

export const uiSheetDetectionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      maxItems: MAX_SMART_SEPARATION_ITEMS,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'role', 'description', 'bounds'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 120 },
          role: { type: 'string', minLength: 1, maxLength: 80 },
          description: { type: 'string', maxLength: 400 },
          bounds: {
            type: 'object',
            additionalProperties: false,
            required: ['x', 'y', 'width', 'height'],
            properties: {
              x: { type: 'integer', minimum: 0, maximum: 1000 },
              y: { type: 'integer', minimum: 0, maximum: 1000 },
              width: { type: 'integer', minimum: 1, maximum: 1000 },
              height: { type: 'integer', minimum: 1, maximum: 1000 },
            },
          },
        },
      },
    },
  },
};

export function groupingSchema(itemIds) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['groups'],
    properties: {
      groups: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_SMART_SEPARATION_GROUPS,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'slug', 'itemIds', 'reasoning'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 100 },
            slug: { type: 'string', minLength: 1, maxLength: 80 },
            itemIds: {
              type: 'array',
              minItems: 1,
              items: { type: 'string', enum: itemIds },
            },
            reasoning: { type: 'string', maxLength: 400 },
          },
        },
      },
    },
  };
}

export function normalizeDetectedItems(payload, source) {
  const rawItems = Array.isArray(payload?.items) ? payload.items : [];
  const remaining = Math.max(0, MAX_SMART_SEPARATION_ITEMS - (source.itemOffset || 0));
  return rawItems.slice(0, remaining).flatMap((raw, index) => {
    const bounds = normalizeBounds(raw?.bounds);
    const name = cleanText(raw?.name, `Element ${index + 1}`, 120);
    if (!bounds) return [];
    return [{
      id: `item-${source.sourceIndex + 1}-${index + 1}-${randomUUID().slice(0, 8)}`,
      sourceIndex: source.sourceIndex,
      sourceUrl: source.sourceUrl,
      sourceAssetId: source.sourceAssetId,
      name,
      role: cleanText(raw?.role, 'UI element', 80),
      description: cleanText(raw?.description, '', 400),
      bounds,
      enabled: true,
    }];
  });
}

export function normalizeGroups(payload, items) {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const assigned = new Set();
  const groups = [];
  for (const raw of Array.isArray(payload?.groups) ? payload.groups.slice(0, MAX_SMART_SEPARATION_GROUPS) : []) {
    const itemIds = [...new Set(Array.isArray(raw?.itemIds) ? raw.itemIds : [])]
      .filter((id) => itemById.has(id) && !assigned.has(id));
    if (!itemIds.length) continue;
    const id = `group-${randomUUID()}`;
    const name = cleanText(raw?.name, `Group ${groups.length + 1}`, 100);
    groups.push({
      id,
      name,
      slug: cleanSlug(raw?.slug || name, `group-${groups.length + 1}`),
      reasoning: cleanText(raw?.reasoning, '', 400),
      status: 'idle',
    });
    itemIds.forEach((itemId) => {
      itemById.get(itemId).groupId = id;
      assigned.add(itemId);
    });
  }

  const unassigned = items.filter((item) => !assigned.has(item.id));
  if (unassigned.length || !groups.length) {
    const id = `group-${randomUUID()}`;
    groups.push({ id, name: 'Unsorted', slug: 'unsorted', reasoning: 'Items that were not assigned to a semantic group.', status: 'idle' });
    for (const item of unassigned.length ? unassigned : items) item.groupId = id;
  }
  return groups;
}

export function fallbackGroup(items) {
  const id = `group-${randomUUID()}`;
  items.forEach((item) => { item.groupId = id; });
  return [{ id, name: 'Unsorted', slug: 'unsorted', reasoning: 'Automatic grouping was unavailable. Review and organize these items manually.', status: 'idle' }];
}

function normalizeBounds(value) {
  if (!value || typeof value !== 'object') return null;
  const x = clampInteger(value.x, 0, 999);
  const y = clampInteger(value.y, 0, 999);
  const width = clampInteger(value.width, 1, 1000 - x);
  const height = clampInteger(value.height, 1, 1000 - y);
  return { x, y, width, height };
}

function clampInteger(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Math.round(Number(value) || 0)));
}

function cleanText(value, fallback, maxLength) {
  const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  return (text || fallback).slice(0, maxLength);
}

function cleanSlug(value, fallback) {
  const slug = String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return slug || fallback;
}
