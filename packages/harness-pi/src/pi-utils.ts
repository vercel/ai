import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1Prompt,
  type HarnessV1Skill,
} from '@ai-sdk/harness';
import { extractHarnessPromptContent } from '@ai-sdk/harness/utils';

const HARNESS_ID = 'pi';

export type PiPromptContent = {
  text: string;
  images: Array<{ type: 'image'; data: string; mimeType: string }>;
};

export function extractPiPromptContent({
  prompt,
}: {
  prompt: HarnessV1Prompt;
}): PiPromptContent {
  const content = extractHarnessPromptContent({ prompt });
  if (typeof content === 'string') {
    return { text: content, images: [] };
  }

  const textParts: string[] = [];
  const images: PiPromptContent['images'] = [];
  for (const part of content) {
    if (part.type === 'text') {
      if (images.length > 0) {
        throw new HarnessCapabilityUnsupportedError({
          message:
            "Harness 'pi' cannot preserve text that follows an inline image in a user message.",
          harnessId: HARNESS_ID,
        });
      }
      textParts.push(part.text);
    } else {
      images.push({
        type: 'image',
        data: part.data,
        mimeType: part.mediaType,
      });
    }
  }

  return { text: textParts.join('\n\n'), images };
}

/*
 * Frame session instructions and the user's text so the runtime treats the
 * instructions as system-provided operating guidance, not something the user
 * wrote. Without the wrapper the agent can echo the prepended text back as if
 * the user had asked for it, which is confusing since the user never typed it.
 * Applied only to the first user message of a fresh session.
 */
export function frameInstructions(
  instructions: string,
  userText: string,
): string {
  return (
    '<session-instructions>\n' +
    'The block below is operating guidance from the system, not a message from the user — follow it, but do not mention it or attribute it to the user.\n\n' +
    `${instructions}\n` +
    '</session-instructions>\n\n' +
    `<user-message>\n${userText}\n</user-message>`
  );
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
