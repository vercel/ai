---
'@ai-sdk/deepinfra': patch
'@ai-sdk/moonshotai': patch
---

Add companion `*-chat-language-model-options.ts` files for `DeepInfraChatLanguageModel` and `MoonshotAIChatLanguageModel`, and add explicit `implements LanguageModelV4` declarations, satisfying the `konsistent` code-consistency convention. Exports `DeepInfraLanguageModelChatOptions` and `MoonshotAILanguageModelChatOptions`.
