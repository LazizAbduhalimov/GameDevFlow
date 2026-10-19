export function generationInputError(prompt, sourceCount, kind) {
  if (!prompt || (!sourceCount && kind !== 'character-front')) return 'At least one input image and a prompt are required.';
  return '';
}
