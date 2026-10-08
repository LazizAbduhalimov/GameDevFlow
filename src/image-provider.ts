import type { ProviderId, ProviderStatus } from './types';

export function resolveImageProvider(value: unknown, fallback: ProviderId): ProviderId {
  return value === 'codex' || value === 'cursor' || value === 'gemini' ? value : fallback;
}

export function imageProviderError(provider: ProviderId, providers: ProviderStatus[], codexConnected: boolean): string {
  if (provider === 'codex') return codexConnected ? '' : 'Connect Codex before running ImageGen.';
  const status = providers.find((item) => item.id === provider);
  if (status?.available) return '';
  return status?.reason || (provider === 'cursor'
    ? 'Cursor CLI is unavailable. Sign in with agent login in a terminal and refresh the provider connection.'
    : 'Gemini image generation is unavailable without an official API provider.');
}
