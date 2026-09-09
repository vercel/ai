import { defineConventions } from '@konsistent/convention';

export const conventions = defineConventions([
  {
    name: 'package-must-have-package-and-docs-files',
    description:
      'Every package directory must contain README, package.json and tsconfig.json.',
    must: {
      haveType: 'directory',
      haveFiles: ['README.md', 'package.json', 'tsconfig.json'],
    },
  },
  {
    name: 'package-must-have-changelog',
    description: 'Every package directory must contain CHANGELOG.md.',
    must: {
      haveFiles: ['CHANGELOG.md'],
    },
  },
  {
    name: 'package-must-have-index',
    description: 'Every package directory must contain src/index.ts.',
    must: {
      haveFiles: ['src/index.ts'],
    },
  },
  {
    name: 'package-must-have-tsup-config',
    description: 'Every package directory must contain tsup.config.ts.',
    must: {
      haveFiles: ['tsup.config.ts'],
    },
  },
  {
    name: 'package-must-import-zod-from-v4',
    description: 'Every package that uses zod must import from zod/v4.',
    mustNot: {
      importValuesFrom: 'zod',
      importTypesFrom: 'zod',
    },
  },
  {
    name: 'provider-package-must-export-provider-creator-and-settings',
    description:
      'Every provider package must export a provider type, creator function, and settings from its index.ts file.',
    must: {
      exportValues: ['create${providerId.toPascalCase()}', 'VERSION'],
      exportTypes: [
        {
          name: '${providerId.toPascalCase()}Provider',
          from: './${providerId}-provider',
        },
        {
          name: '${providerId.toPascalCase()}ProviderSettings',
          from: './${providerId}-provider',
        },
      ],
      haveFiles: ['${providerId}-provider.ts'],
    },
  },
  {
    name: 'provider-package-must-export-instance-case-1',
    description:
      'Every provider package must export a provider instance from its index.ts file.',
    if: {
      placeholderSatisfies: 'providerId:matches(^[a-z]+ai$)',
    },
    must: {
      exportValues: ['${providerId.toFlatCase()}'],
    },
  },
  {
    name: 'provider-package-must-export-instance-case-2',
    description:
      'Every provider package must export a provider instance from its index.ts file.',
    if: {
      placeholderSatisfies: 'providerId:matches(^(?!^[a-z]+ai$).*$)',
    },
    must: {
      exportValues: ['${providerId.toCamelCase()}'],
    },
  },
  {
    name: 'provider-file-must-export-provider-class-and-settings-type',
    description:
      'Every provider file must export a provider class and a provider settings type.',
    for: {
      files: ['${providerId}-provider.ts', 'google-vertex-provider-base.ts'],
    },
    must: {
      importTypes: [
        {
          name: 'ProviderV4',
          from: '@ai-sdk/provider',
        },
      ],
      exportInterfaces: [
        {
          name: '${providerId.toPascalCase()}Provider',
          extend: 'ProviderV4',
        },
        '${providerId.toPascalCase()}ProviderSettings',
      ],
      exportFunctions: [
        {
          name: 'create${providerId.toPascalCase()}',
          receiveParamsOfTypes: [
            '${providerId.toPascalCase()}ProviderSettings',
          ],
          returnValueOfType: '${providerId.toPascalCase()}Provider',
        },
      ],
    },
  },
  {
    name: 'provider-file-must-export-provider-instance-case-1',
    description: 'Every provider file must export a provider instance.',
    for: {
      files: '${providerId}-provider.ts',
    },
    if: {
      placeholderSatisfies: 'providerId:matches(^[a-z]+ai$)',
    },
    must: {
      exportConstants: ['${providerId.toFlatCase()}'],
    },
  },
  {
    name: 'provider-file-must-export-provider-instance-case-2',
    description: 'Every provider file must export a provider instance.',
    for: {
      files: '${providerId}-provider.ts',
    },
    if: {
      placeholderSatisfies: 'providerId:matches(^(?!^[a-z]+ai$).*$)',
    },
    must: {
      exportConstants: ['${providerId.toCamelCase()}'],
    },
  },
  {
    name: 'provider-model-file-must-export-model-class',
    description: "Every provider's model file must export a model class.",
    for: {
      files: [
        '${providerId}-{modelKind:segments(1)}-model.ts',
        '*/${providerId}-{modelKind:segments(1)}-model.ts',
      ],
    },
    must: {
      importTypes: [
        {
          name: '${modelKind.toPascalCase()}ModelV4',
          from: '@ai-sdk/provider',
        },
      ],
      exportClasses: [
        {
          name: '${providerId.toPascalCase()}${modelKind.toPascalCase()}Model',
          implement: ['${modelKind.toPascalCase()}ModelV4'],
        },
      ],
    },
  },
  {
    name: 'provider-model-file-must-have-matching-model-options-file',
    description:
      "Every provider's model file must have a matching model options file.",
    for: {
      files: [
        '${providerId}-{modelKind:segments(1)}-model.ts',
        '*/${providerId}-{modelKind:segments(1)}-model.ts',
      ],
    },
    must: {
      haveFiles: ['${providerId}-${modelKind}-model-options.ts'],
    },
  },
  {
    name: 'provider-model-file-with-subtype-must-export-model-class',
    description:
      "Every provider's model file with a specific subtype (e.g. chat, responses) must export a model class.",
    for: {
      files: [
        '${providerId}-{modelKind:segments(2)}-model.ts',
        '*/${providerId}-{modelKind:segments(2)}-model.ts',
      ],
    },
    must: {
      importTypes: [
        {
          name: '${modelKind.toNthSegmentPascalCase(1)}ModelV4',
          from: '@ai-sdk/provider',
        },
      ],
      exportClasses: [
        {
          name: '${providerId.toPascalCase()}${modelKind.toNthSegmentPascalCase(0)}${modelKind.toNthSegmentPascalCase(1)}Model',
          implement: ['${modelKind.toNthSegmentPascalCase(1)}ModelV4'],
        },
      ],
    },
  },
  {
    name: 'provider-model-file-with-subtype-must-have-matching-model-options-file',
    description:
      "Every provider's model file with a specific subtype (e.g. chat, responses) must have a matching model options file.",
    for: {
      files: [
        '${providerId}-{modelKind:segments(2)}-model.ts',
        '*/${providerId}-{modelKind:segments(2)}-model.ts',
      ],
    },
    must: {
      haveFiles: ['${providerId}-${modelKind}-model-options.ts'],
    },
  },
  {
    name: 'provider-realtime-model-file-must-export-model-class',
    description:
      "Every provider's realtime model file must export a model class (separated only because RealtimeModelV4 type is experimental).",
    for: {
      files: [
        '${providerId}-realtime-model.ts',
        '*/${providerId}-realtime-model.ts',
      ],
    },
    must: {
      importTypes: [
        {
          name: 'Experimental_RealtimeModelV4',
          from: '@ai-sdk/provider',
          alias: 'RealtimeModelV4',
        },
      ],
      exportClasses: [
        {
          name: '${providerId.toPascalCase()}RealtimeModel',
          implement: ['RealtimeModelV4'],
        },
      ],
    },
  },
  {
    name: 'provider-realtime-model-file-must-have-matching-model-options-file',
    description:
      "Every provider's realtime model file must have a matching model options file (separated only because RealtimeModelV4 type is experimental).",
    for: {
      files: [
        '${providerId}-realtime-model.ts',
        '*/${providerId}-realtime-model.ts',
      ],
    },
    must: {
      haveFiles: ['${providerId}-realtime-model-options.ts'],
    },
  },
  {
    name: 'provider-speech-translation-model-file-must-export-model-class',
    description:
      "Every provider's speech translation model file must export a model class (separated only because SpeechTranslationModelV4 type is experimental).",
    for: {
      files: [
        '${providerId}-speech-translation-model.ts',
        '*/${providerId}-speech-translation-model.ts',
      ],
    },
    must: {
      importTypes: [
        {
          name: 'Experimental_SpeechTranslationModelV4',
          from: '@ai-sdk/provider',
          alias: 'SpeechTranslationModelV4',
        },
      ],
      exportClasses: [
        {
          name: '${providerId.toPascalCase()}SpeechTranslationModel',
          implement: ['SpeechTranslationModelV4'],
        },
      ],
    },
  },
  {
    name: 'provider-speech-translation-model-file-must-have-matching-model-options-file',
    description:
      "Every provider's speech translation model file must have a matching model options file (separated only because SpeechTranslationModelV4 type is experimental).",
    for: {
      files: [
        '${providerId}-speech-translation-model.ts',
        '*/${providerId}-speech-translation-model.ts',
      ],
    },
    must: {
      haveFiles: ['${providerId}-speech-translation-model-options.ts'],
    },
  },
  {
    name: 'provider-video-model-file-must-export-model-class',
    description:
      "Every provider's video model file must export a model class (separated only because VideoModelV4 type is experimental).",
    for: {
      files: ['${providerId}-video-model.ts', '*/${providerId}-video-model.ts'],
    },
    must: {
      importTypes: [
        {
          name: 'Experimental_VideoModelV4',
          from: '@ai-sdk/provider',
          alias: 'VideoModelV4',
        },
      ],
      exportClasses: [
        {
          name: '${providerId.toPascalCase()}VideoModel',
          implement: ['VideoModelV4'],
        },
      ],
    },
  },
  {
    name: 'provider-video-model-file-must-have-matching-model-options-file',
    description:
      "Every provider's video model file must have a matching model options file (separated only because VideoModelV4 type is experimental).",
    for: {
      files: ['${providerId}-video-model.ts', '*/${providerId}-video-model.ts'],
    },
    must: {
      haveFiles: ['${providerId}-video-model-options.ts'],
    },
  },
  {
    name: 'provider-language-model-file-must-import-workflow-serialization',
    description:
      "Every provider's language model file must import the workflow serialization helpers.",
    for: {
      files: [
        '${providerId}-language-model.ts',
        '*/${providerId}-language-model.ts',
        '${providerId}-*-language-model.ts',
        '*/${providerId}-*-language-model.ts',
      ],
    },
    must: {
      importValues: [
        {
          name: 'serializeModelOptions',
          from: '@ai-sdk/provider-utils',
        },
        {
          name: 'WORKFLOW_SERIALIZE',
          from: '@ai-sdk/provider-utils',
        },
        {
          name: 'WORKFLOW_DESERIALIZE',
          from: '@ai-sdk/provider-utils',
        },
      ],
    },
  },
  {
    name: 'provider-model-options-file-must-export-model-options-type',
    description:
      "Every provider's model options file must export a model options type.",
    for: {
      files: [
        '${providerId}-{modelKind:segments(1)}-model-options.ts',
        '*/${providerId}-{modelKind:segments(1)}-model-options.ts',
      ],
    },
    must: {
      exportTypes: [
        '${providerId.toPascalCase()}${modelKind.toPascalCase()}ModelOptions',
      ],
    },
  },
  {
    name: 'provider-model-options-file-with-subtype-must-export-model-options-type',
    description:
      "Every provider's model options file must export a model options type.",
    for: {
      files: [
        '${providerId}-{modelKind:segments(2)}-model-options.ts',
        '*/${providerId}-{modelKind:segments(2)}-model-options.ts',
      ],
    },
    must: {
      exportTypes: [
        '${providerId.toPascalCase()}${modelKind.toNthSegmentPascalCase(1)}Model${modelKind.toNthSegmentPascalCase(0)}Options',
      ],
    },
  },
  {
    name: 'provider-speech-translation-model-options-file-must-export-model-options-type',
    description:
      "Every provider's model options file must export a model options type.",
    for: {
      files: [
        '${providerId}-speech-translation-model-options.ts',
        '*/${providerId}-speech-translation-model-options.ts',
      ],
    },
    must: {
      exportTypes: [
        '${providerId.toPascalCase()}SpeechTranslationModelOptions',
      ],
    },
  },
] as const);
