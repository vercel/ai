import { LanguageModelV3Prompt, SharedV3Warning } from '@ai-sdk/provider';

// Lazy-loaded tiktoken module
let tiktokenModule: typeof import('js-tiktoken') | null = null;
let tiktokenLoadFailed = false;

// Cache for encodings to avoid repeated initialization
const encodingCache = new Map<
  string,
  ReturnType<typeof import('js-tiktoken').getEncoding>
>();

async function loadTiktoken(): Promise<typeof import('js-tiktoken') | null> {
  if (tiktokenModule) return tiktokenModule;
  if (tiktokenLoadFailed) return null;

  try {
    // Dynamic import to avoid bundle bloat
    tiktokenModule = await import('js-tiktoken');
    return tiktokenModule;
  } catch {
    tiktokenLoadFailed = true;
    return null;
  }
}

async function getEncoderForModel(
  modelId: string,
): Promise<ReturnType<typeof import('js-tiktoken').getEncoding> | null> {
  const tiktoken = await loadTiktoken();
  if (!tiktoken) return null;

  let encodingName: string;
  try {
    encodingName = tiktoken.getEncodingNameForModel(
      modelId as Parameters<typeof tiktoken.getEncodingNameForModel>[0],
    );
  } catch {
    // Default encodings for unknown models
    if (
      modelId.startsWith('o1') ||
      modelId.startsWith('o3') ||
      modelId.startsWith('gpt-4o')
    ) {
      encodingName = 'o200k_base';
    } else {
      encodingName = 'cl100k_base';
    }
  }

  if (!encodingCache.has(encodingName)) {
    encodingCache.set(
      encodingName,
      tiktoken.getEncoding(
        encodingName as Parameters<typeof tiktoken.getEncoding>[0],
      ),
    );
  }

  return encodingCache.get(encodingName)!;
}

/**
 * Calculate image tokens for OpenAI based on detail level and dimensions.
 * Formula from: https://platform.openai.com/docs/guides/vision
 */
function calculateImageTokens({
  width,
  height,
  detail,
}: {
  width?: number;
  height?: number;
  detail?: 'low' | 'high' | 'auto';
}): number {
  // Low detail: fixed 85 tokens
  if (detail === 'low') {
    return 85;
  }

  // High detail or auto (default is high):
  // 1. Scale image to fit within 2048x2048
  // 2. Scale shortest side to 768px
  // 3. Count 512x512 tiles, each costs 170 tokens
  // 4. Add 85 base tokens

  if (!width || !height) {
    // Unknown dimensions - use conservative estimate (single tile + base)
    return 170 + 85;
  }

  // Scale to fit 2048x2048
  let scaledWidth = width;
  let scaledHeight = height;
  const maxDim = 2048;
  if (scaledWidth > maxDim || scaledHeight > maxDim) {
    const ratio = Math.min(maxDim / scaledWidth, maxDim / scaledHeight);
    scaledWidth = Math.floor(scaledWidth * ratio);
    scaledHeight = Math.floor(scaledHeight * ratio);
  }

  // Scale shortest side to 768
  const targetShortSide = 768;
  const shortSide = Math.min(scaledWidth, scaledHeight);
  if (shortSide > targetShortSide) {
    const ratio = targetShortSide / shortSide;
    scaledWidth = Math.floor(scaledWidth * ratio);
    scaledHeight = Math.floor(scaledHeight * ratio);
  }

  // Count 512x512 tiles
  const tilesX = Math.ceil(scaledWidth / 512);
  const tilesY = Math.ceil(scaledHeight / 512);
  const totalTiles = tilesX * tilesY;

  return totalTiles * 170 + 85;
}

export async function countTokensForOpenAI({
  modelId,
  prompt,
  tools,
}: {
  modelId: string;
  prompt: LanguageModelV3Prompt;
  tools?: Array<unknown>;
}): Promise<{ tokens: number; warnings: SharedV3Warning[] }> {
  const encoder = await getEncoderForModel(modelId);
  const warnings: SharedV3Warning[] = [];
  let totalTokens = 0;

  if (!encoder) {
    warnings.push({
      type: 'other',
      message:
        'js-tiktoken is not installed. Install it with `npm install js-tiktoken` for accurate token counts. Returning rough estimate.',
    });
    // Rough estimate: ~4 chars per token
    const textContent = JSON.stringify(prompt);
    return {
      tokens: Math.ceil(textContent.length / 4),
      warnings,
    };
  }

  // Count tokens in messages
  for (const message of prompt) {
    // Each message has overhead tokens (role, separators)
    totalTokens += 4; // <|start|>role<|end|>

    if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part.type === 'text') {
          totalTokens += encoder.encode(part.text).length;
        } else if (part.type === 'tool-result') {
          totalTokens += encoder.encode(JSON.stringify(part.output)).length;
        } else if (
          part.type === 'file' &&
          part.mediaType?.startsWith('image/')
        ) {
          // Calculate image tokens based on detail level
          const providerOptions = part.providerOptions as
            | {
                openai?: {
                  imageDetail?: 'low' | 'high' | 'auto';
                  width?: number;
                  height?: number;
                };
              }
            | undefined;
          const detail = providerOptions?.openai?.imageDetail;
          totalTokens += calculateImageTokens({
            width: providerOptions?.openai?.width,
            height: providerOptions?.openai?.height,
            detail: detail ?? 'auto',
          });
        } else if (part.type === 'tool-call') {
          // Tool calls include the function name and arguments
          totalTokens += encoder.encode(part.toolName).length;
          totalTokens += encoder.encode(JSON.stringify(part.input)).length;
        } else if (part.type === 'reasoning') {
          totalTokens += encoder.encode(part.text).length;
        }
      }
    }
  }

  // Count tokens in tool definitions
  // Note: This is an approximation - OpenAI injects tools differently than raw JSON
  // Adding 10% buffer to account for schema formatting differences
  if (tools && tools.length > 0) {
    const toolsJson = JSON.stringify(tools);
    const baseToolTokens = encoder.encode(toolsJson).length;
    const bufferMultiplier = 1.1; // 10% safety buffer
    totalTokens += Math.ceil(baseToolTokens * bufferMultiplier);
  }

  // Add base overhead for the request
  totalTokens += 3; // Every reply is primed with <|start|>assistant<|message|>

  return { tokens: totalTokens, warnings };
}
