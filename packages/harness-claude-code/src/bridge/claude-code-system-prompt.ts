export function createClaudeCodeSystemPrompt(
  instructions?: string,
  options?: { excludeDynamicSections?: boolean },
): {
  type: 'preset';
  preset: 'claude_code';
  append?: string;
  excludeDynamicSections?: boolean;
} {
  return {
    type: 'preset',
    preset: 'claude_code',
    ...(instructions ? { append: instructions } : {}),
    ...(options?.excludeDynamicSections !== undefined
      ? { excludeDynamicSections: options.excludeDynamicSections }
      : {}),
  };
}
