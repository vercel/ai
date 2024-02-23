export function isTextPrompt(prompt: unknown): prompt is string {
  return typeof prompt === 'string';
}
