import type { QuiverAIModelIds } from './quiverai-model-catalog';
/**
 * QuiverAI image model identifier.
 *
 * @see https://quiver.ai/
 */
export type QuiverAIImageModelId = QuiverAIModelIds['image'] | (string & {});

/**
 * QuiverAI image operation:
 * - `generate`: Text-to-SVG generation (default).
 * - `vectorize`: Convert a raster image into an SVG.
 * - `animate`: Animate a single source SVG.
 * - `edit`: Edit a single source SVG with a text instruction.
 */
export type QuiverAIOperation = 'generate' | 'vectorize' | 'animate' | 'edit';
