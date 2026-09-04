type GoogleModelCapabilities = {
  supportsGemini2Tools: boolean;
  supportsFileSearch: boolean;
  usesGemini3Features: boolean;
};

const gemini1ModelPattern = /(^|\/)gemini-1(?:[.-]|$)/i;
const gemini2ModelPattern = /(^|\/)gemini-2(?:[.-]|$)/i;
const gemini25ModelPattern = /(^|\/)gemini-2\.5(?:[.-]|$)/i;
const geminiModelPattern = /(^|\/)gemini-/i;

function isKnownPreGemini2Model(modelId: string): boolean {
  return (
    gemini1ModelPattern.test(modelId) ||
    /(^|\/)gemini-pro(?:-vision)?$/i.test(modelId) ||
    /(^|\/)gemini-robotics-er-1\.5(?:[.-]|$)/i.test(modelId)
  );
}

/**
 * Classifies Gemini capabilities by excluding known older generations.
 *
 * Google model IDs are open-ended, so unrecognized Gemini IDs and aliases
 * intentionally inherit the newest supported behavior. Add exceptions here
 * only when a model is known to require a legacy request shape.
 */
export function getGoogleModelCapabilities(
  modelId: string,
): GoogleModelCapabilities {
  const isGeminiModel = geminiModelPattern.test(modelId);
  const isGemini2Model = gemini2ModelPattern.test(modelId);
  const isKnownPreGemini2 = isKnownPreGemini2Model(modelId);
  const isKnownOlderModel = isKnownPreGemini2 || isGemini2Model;
  const usesGemini3Features = isGeminiModel && !isKnownOlderModel;

  return {
    supportsGemini2Tools:
      (isGeminiModel && !isKnownPreGemini2) ||
      modelId.toLowerCase().includes('nano-banana'),
    supportsFileSearch:
      gemini25ModelPattern.test(modelId) || usesGemini3Features,
    usesGemini3Features,
  };
}
