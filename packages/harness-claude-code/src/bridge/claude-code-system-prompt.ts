export function createClaudeCodeSystemPrompt(instructions?: string): {
  type: 'preset';
  preset: 'claude_code';
  append?: string;
} {
  return {
    type: 'preset',
    preset: 'claude_code',
    ...(instructions ? { append: instructions } : {}),
  };
}
