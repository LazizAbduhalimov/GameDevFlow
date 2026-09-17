import { describe, expect, it } from 'vitest';
import {
  buildCharacterViewPrompt,
  CHARACTER_IDENTITY_PROMPT,
  CHARACTER_POSE_SPECS,
  CHARACTER_VIEW_SPECS,
  normalizeCharacterPose,
} from '../../src/character-views';

describe('Character view prompts', () => {
  it('defaults unknown pose values to A-pose', () => {
    expect(normalizeCharacterPose(undefined)).toBe('a-pose');
    expect(normalizeCharacterPose('t-pose')).toBe('t-pose');
    expect(normalizeCharacterPose('idle')).toBe('a-pose');
  });

  it('builds a hidden identity prompt with pose and orthographic view instructions', () => {
    const prompt = buildCharacterViewPrompt({ view: 'left', pose: 't-pose' });
    expect(prompt).toContain(CHARACTER_IDENTITY_PROMPT);
    expect(prompt).toContain(CHARACTER_POSE_SPECS['t-pose'].prompt);
    expect(prompt).toContain(CHARACTER_VIEW_SPECS.left.prompt);
    expect(prompt).not.toMatch(/write a prompt|describe the character/i);
  });

  it('keeps a saved identity prompt while swapping pose language', () => {
    const aPose = buildCharacterViewPrompt({ view: 'front', pose: 'a-pose', identityPrompt: 'Keep the green zombie farmer.' });
    const tPose = buildCharacterViewPrompt({ view: 'front', pose: 't-pose', identityPrompt: 'Keep the green zombie farmer.' });
    expect(aPose).toContain('Keep the green zombie farmer.');
    expect(aPose).toContain('A-pose');
    expect(tPose).toContain('T-pose');
    expect(tPose).not.toContain(CHARACTER_POSE_SPECS['a-pose'].prompt);
  });
});
