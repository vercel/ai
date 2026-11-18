// Catalog: https://gateway.inference.coop/v1/models (see also the co-op's
// model list at https://inference.coop/docs/models.md).
// The provider prefix selects where the model runs: `tinfoil/` in TEE
// enclaves (architecturally private), `greenpt/` and `regolo/` on 100%
// renewable energy in the EU.
export type InferenceCoopChatModelId =
  | 'greenpt/deepseek-v4.1-flash'
  | 'tinfoil/deepseek-v4-1-flash'
  | 'tinfoil/glm-5.3'
  | 'tinfoil/gpt-oss-120b'
  | 'greenpt/glm-5.3-flash'
  | 'greenpt/glm-5.3'
  | 'regolo/apertus-70b'
  | 'regolo/qwen3.5-122b'
  | (string & {});
