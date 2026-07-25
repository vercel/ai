import type { MetadataExtractor } from '@ai-sdk/openai-compatible';
import type { JSONObject } from '@ai-sdk/provider';

interface InterfazeTopLevelFields {
  vcache?: boolean;
  reasoning?: string;
  precontext?: unknown[];
}

function readTopLevelFields(value: unknown): InterfazeTopLevelFields {
  if (value == null || typeof value !== 'object') {
    return {};
  }
  const obj = value as Record<string, unknown>;
  const fields: InterfazeTopLevelFields = {};
  if (typeof obj.vcache === 'boolean') {
    fields.vcache = obj.vcache;
  }
  if (typeof obj.reasoning === 'string' && obj.reasoning.length > 0) {
    fields.reasoning = obj.reasoning;
  }
  if (Array.isArray(obj.precontext) && obj.precontext.length > 0) {
    fields.precontext = obj.precontext;
  }
  return fields;
}

function toMetadata(fields: InterfazeTopLevelFields): {
  interfaze: JSONObject;
} {
  return {
    interfaze: {
      vcache: fields.vcache ?? false,
      ...(fields.reasoning != null ? { reasoning: fields.reasoning } : {}),
      ...(fields.precontext != null ? { precontext: fields.precontext } : {}),
      // `precontext` entries are provider-defined and not statically known to
      // be JSON-serializable at the type level, even though they always are
      // at runtime (parsed straight out of the response JSON).
    } as JSONObject,
  };
}

/**
 * Non-streaming responses carry `vcache`/`reasoning`/`precontext` as
 * top-level JSON fields, so this is a straightforward read for `doGenerate`.
 *
 * Streaming responses, by contrast, only embed `<think>`/`<precontext>` tags
 * inline in `delta.content` — Interfaze does not send these as top-level
 * per-chunk fields while tokens are streaming.
 */
export function createInterfazeMetadataExtractor(): MetadataExtractor {
  return {
    async extractMetadata({ parsedBody }) {
      return toMetadata(readTopLevelFields(parsedBody));
    },

    createStreamExtractor() {
      let vcache: boolean | undefined;
      let reasoning: string | undefined;
      let precontext: unknown[] | undefined;

      return {
        processChunk(parsedChunk: unknown) {
          const fields = readTopLevelFields(parsedChunk);
          if (fields.vcache != null) {
            vcache = fields.vcache;
          }
          if (fields.reasoning != null) {
            reasoning = fields.reasoning;
          }
          if (fields.precontext != null) {
            precontext = fields.precontext;
          }
        },

        buildMetadata() {
          return toMetadata({ vcache, reasoning, precontext });
        },
      };
    },
  };
}
