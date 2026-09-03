const LEGACY_VIEW_LIMIT = 4;
const DEFAULT_SLOT_LIMIT = 6;
const BATCH_KINDS = new Set(['variants', 'icon-set', 'character-parts']);

export function normalizeBatchRequest(body = {}) {
  const sourceUrl = stringValue(body.sourceUrl, 4_096);
  const sourceUrls = Array.isArray(body.sourceUrls)
    ? [...new Set(body.sourceUrls.slice(0, 4).map((value) => stringValue(value, 4_096)).filter(Boolean))]
    : sourceUrl ? [sourceUrl] : [];
  if (!sourceUrls.length && sourceUrl) sourceUrls.push(sourceUrl);
  const provider = stringValue(body.provider, 64) || 'codex';
  const concurrency = normalizeConcurrency(body.concurrency);

  if (Array.isArray(body.views)) {
    return {
      sourceUrl,
      sourceUrls: sourceUrl ? [sourceUrl] : sourceUrls.slice(0, 1),
      provider,
      concurrency,
      batchKind: 'character-views',
      slots: normalizeLegacyViews(body.views),
    };
  }

  const batchKind = stringValue(body.kind, 32) || 'variants';
  if (!BATCH_KINDS.has(batchKind)) throw batchError('UNSUPPORTED_BATCH_KIND', 'Batch kind must be "variants", "icon-set", or "character-parts".');
  return {
    sourceUrl,
    sourceUrls,
    provider,
    concurrency,
    batchKind,
    slots: normalizeSlots(body.slots, batchKind),
  };
}

function normalizeConcurrency(value) {
  if (value === undefined || value === null || value === '') return 1;
  const concurrency = Number(value);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) {
    throw batchError('BATCH_CONCURRENCY', 'Batch concurrency must be a whole number from 1 to 4.');
  }
  return concurrency;
}

export function batchRequestErrorMessage(error) {
  return error?.code?.startsWith('BATCH_') || error?.code === 'UNSUPPORTED_BATCH_KIND' ? error.message : null;
}

function normalizeLegacyViews(views) {
  if (!views.length || views.length > LEGACY_VIEW_LIMIT) {
    throw batchError('BATCH_SLOT_COUNT', 'Character Views batches require one to four views.');
  }
  return views.map((view, index) => {
    const key = stringValue(view?.key, 32);
    return normalizeSlot(view, index, 'character-views', { slotKey: key || `view-${index + 1}`, viewKey: key || null });
  });
}

function normalizeSlots(slots, batchKind) {
  if (!Array.isArray(slots) || !slots.length || slots.length > DEFAULT_SLOT_LIMIT) {
    const label = batchKind === 'icon-set' ? 'Icon Set' : batchKind === 'character-parts' ? 'Character Parts' : 'Variants';
    throw batchError('BATCH_SLOT_COUNT', `${label} batches require one to ${DEFAULT_SLOT_LIMIT} slots.`);
  }
  return slots.map((slot, index) => normalizeSlot(slot, index, batchKind, { slotKey: stringValue(slot?.key ?? slot?.slotKey, 32) || `${batchKind}-${index + 1}`, viewKey: null }));
}

function normalizeSlot(slot, index, batchKind, { slotKey, viewKey }) {
  const prompt = stringValue(slot?.prompt, 8_000);
  if (!prompt) throw batchError('BATCH_SLOT_PROMPT', `Batch slot ${index + 1} needs a prompt.`);
  return {
    prompt,
    outputName: stringValue(slot?.outputName, 180),
    batchKind,
    slotKey,
    slotIndex: index,
    viewKey,
  };
}

function stringValue(value, limit) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function batchError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
