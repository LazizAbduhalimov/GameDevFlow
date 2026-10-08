import { describe, expect, it } from 'vitest';
import { imageProviderError, resolveImageProvider } from '../../src/image-provider';

describe('image provider selection', () => {
  it('retains explicit Codex when the default is Cursor', () => {
    expect(resolveImageProvider('codex', 'cursor')).toBe('codex');
    expect(resolveImageProvider('global', 'cursor')).toBe('cursor');
    expect(resolveImageProvider('cursor', 'codex')).toBe('cursor');
  });
  it('allows Cursor jobs while Codex is disconnected', () => {
    expect(imageProviderError('cursor', [{ id: 'cursor', label: 'Cursor', available: true }], false)).toBe('');
    expect(imageProviderError('codex', [], false)).toContain('Connect Codex');
  });
  it('shows the selected provider failure', () => {
    expect(imageProviderError('cursor', [{ id: 'cursor', label: 'Cursor', available: false, reason: 'Please sign in' }], true)).toBe('Please sign in');
    expect(imageProviderError('gemini', [], true)).toContain('Gemini');
  });
});
