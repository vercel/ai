export type OpenAICompatibleChatModelId = string;

export interface OpenAICompatibleChatSettings {
  /**
A unique identifier representing your end-user, which can help the provider to
monitor and detect abuse.
  */
  user?: string;

  /**
Default object generation mode that should be used with this model when
no mode is specified. Should be the mode with the best results for this
model. `undefined` can be returned if object generation is not supported.

This is needed to generate the best objects possible w/o requiring the
user to explicitly specify the object generation mode.
  */
  // TODO(shaper): This is really model-specific, move to config or elsewhere?
  defaultObjectGenerationMode?: 'json' | 'tool' | undefined;
}
