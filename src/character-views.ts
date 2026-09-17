import type { CharacterPose, ViewKey } from './types';

export const CHARACTER_VIEW_KEYS: ViewKey[] = ['front', 'left', 'back', 'right'];
export const CHARACTER_VIEW_GRID: ViewKey[] = ['front', 'back', 'left', 'right'];

export const CHARACTER_IDENTITY_PROMPT =
  'Preserve this exact character identity, outfit, proportions, palette, materials and every accessory across all views.';

export const CHARACTER_VIEW_SPECS: Record<ViewKey, { title: string; prompt: string }> = {
  front: {
    title: 'Front',
    prompt: 'Create a clean full-body front orthographic view. Centered, plain studio background, even lighting, no perspective distortion.',
  },
  back: {
    title: 'Back',
    prompt: 'Create a clean full-body back orthographic view. Centered, plain studio background, even lighting, no perspective distortion.',
  },
  left: {
    title: 'Left',
    prompt: 'Create a clean full-body left orthographic side view. Centered, plain studio background, even lighting, no perspective distortion.',
  },
  right: {
    title: 'Right',
    prompt: 'Create a clean full-body right orthographic side view. Centered, plain studio background, even lighting, no perspective distortion.',
  },
};

export const CHARACTER_POSE_SPECS: Record<CharacterPose, { label: string; prompt: string }> = {
  'a-pose': {
    label: 'A-pose',
    prompt:
      'Hold a production A-pose: arms away from the torso at about 35 degrees, elbows softly straight, palms facing down, legs straight, feet slightly apart. Keep this exact pose in every view. Do not use a T-pose.',
  },
  't-pose': {
    label: 'T-pose',
    prompt:
      'Hold a production T-pose: both arms fully extended horizontally to the sides, palms facing down, legs straight, feet slightly apart. Keep this exact pose in every view. Do not use an A-pose.',
  },
};

export function normalizeCharacterPose(value: unknown): CharacterPose {
  return value === 't-pose' ? 't-pose' : 'a-pose';
}

export function buildCharacterViewPrompt(options: {
  view: ViewKey;
  pose?: unknown;
  identityPrompt?: string;
  viewPrompt?: string;
}): string {
  const pose = normalizeCharacterPose(options.pose);
  const identity = options.identityPrompt?.trim() || CHARACTER_IDENTITY_PROMPT;
  const viewPrompt = options.viewPrompt?.trim() || CHARACTER_VIEW_SPECS[options.view].prompt;
  return `${identity}\n\n${CHARACTER_POSE_SPECS[pose].prompt}\n\n${viewPrompt}`;
}
