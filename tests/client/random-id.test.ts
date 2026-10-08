import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { randomUUID } from '../../src/random-id';

describe('UUIDs on LAN HTTP', () => {
  it('uses cryptographic random values when randomUUID is unavailable', () => {
    const httpCrypto = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) };
    const ids = Array.from({ length: 100 }, () => randomUUID(httpCrypto));
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/));
  });

  it('keeps the native UUID method when available', () => {
    const expected = '11111111-1111-4111-8111-111111111111';
    expect(randomUUID({ getRandomValues: webcrypto.getRandomValues.bind(webcrypto), randomUUID: () => expected })).toBe(expected);
  });
});
