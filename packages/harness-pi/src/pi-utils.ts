import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1Prompt,
  type HarnessV1Skill,
} from '@ai-sdk/harness';

const HARNESS_ID = 'pi';

/**
 * Extract a single user text string from a `HarnessV1Prompt`. Pi's
 * `session.prompt(text)` accepts a string; multimodal user content
 * is not supported in this foundational version.
 */
export function extractUserText(prompt: HarnessV1Prompt): string {
  if (typeof prompt === 'string') {
    return prompt;
  }

  const { content } = prompt;
  if (typeof content === 'string') {
    return content;
  }

  const parts: string[] = [];
  for (const part of content) {
    if (part.type !== 'text') {
      throw new HarnessCapabilityUnsupportedError({
        message: `pi: only text user-message parts are supported; got '${part.type}'.`,
        harnessId: HARNESS_ID,
      });
    }
    parts.push(part.text);
  }
  return parts.join('\n\n');
}

/** POSIX shell single-quote escape. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Serialize a tool output to the string Pi feeds back to the model. */
export function serializeToolOutput(output: unknown): string {
  if (typeof output === 'string') {
    return output;
  }
  const serialized = JSON.stringify(output);
  return serialized ?? 'null';
}

export function getErrorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Validate that a name is safe to use as a filesystem path segment under
 * `.pi/skills/<name>/` or `.pi/agents/<name>.md`. Refuses anything that
 * could be interpreted as a path traversal or contains shell-sensitive
 * characters.
 */
export function safePiMetadataSegment(name: string, label: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(name) || name === '.' || name === '..') {
    throw new Error(`Invalid Pi ${label} name: ${name}`);
  }
  return name;
}

/** Frontmatter renderer for `.pi/skills/<name>/SKILL.md`. */
export function renderPiSkillFile(skill: HarnessV1Skill): string {
  return `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n\n${skill.content}`;
}
