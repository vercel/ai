/**
 * QuiverAI image model identifier.
 *
 * @see https://quiver.ai/
 */
export type QuiverAIImageModelId =
  | 'arrow-1'
  | 'arrow-1.1'
  | 'arrow-1.1-max'
  | 'arrow-2'
  | 'arrow-2-telos'
  | (string & {});

/**
 * QuiverAI image operation:
 * - `generate`: Text-to-SVG generation (default).
 * - `vectorize`: Convert a raster image into an SVG.
 * - `animate`: Animate a single source SVG.
 * - `edit`: Edit a single source SVG with a text instruction.
 */
export type QuiverAIOperation = 'generate' | 'vectorize' | 'animate' | 'edit';
