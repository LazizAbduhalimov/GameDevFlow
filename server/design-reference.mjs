export const PROJECT_DESIGN_TRIGGER = 'сохрани наш дизайн';

export function promptUsesProjectDesign(prompt) {
  return String(prompt || '')
    .toLocaleLowerCase('ru-RU')
    .replace(/\s+/g, ' ')
    .includes(PROJECT_DESIGN_TRIGGER);
}

export function preserveProjectDesignTrigger(originalPrompt, enhancedPrompt) {
  const enhanced = String(enhancedPrompt || '').trim();
  if (promptUsesProjectDesign(originalPrompt) && !promptUsesProjectDesign(enhanced)) {
    return `${PROJECT_DESIGN_TRIGGER}. ${enhanced}`.trim();
  }
  return enhanced;
}

export function withProjectDesignReference(sources, projectDesignSource, prompt, maxReferences) {
  if (!promptUsesProjectDesign(prompt)) return { sources, usesProjectDesignReference: false };
  if (!projectDesignSource) {
    const error = new Error(`Add a project design reference before using “${PROJECT_DESIGN_TRIGGER}” in a prompt.`);
    error.code = 'PROJECT_DESIGN_REFERENCE_REQUIRED';
    throw error;
  }
  const withoutDuplicate = sources.filter((source) => source.assetId !== projectDesignSource.assetId && source.url !== projectDesignSource.url);
  const merged = [...withoutDuplicate, projectDesignSource];
  if (merged.length > maxReferences) {
    const error = new Error(`The project design reference would exceed the ${maxReferences}-image generation limit.`);
    error.code = 'PROJECT_DESIGN_REFERENCE_LIMIT';
    throw error;
  }
  return { sources: merged, usesProjectDesignReference: true };
}
