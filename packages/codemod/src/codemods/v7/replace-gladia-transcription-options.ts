import { createTransformer } from '../lib/create-transformer';

export default createTransformer((fileInfo, api, options, context) => {
  const { j, root } = context;

  function isProperty(node: any): boolean {
    return node.type === 'ObjectProperty' || node.type === 'Property';
  }

  function getKeyName(prop: any): string | null {
    if (!isProperty(prop)) return null;
    if (prop.key.type === 'Identifier') return prop.key.name;
    if (prop.key.type === 'StringLiteral') return prop.key.value;
    return null;
  }

  function removeProperty(properties: any[], prop: any) {
    const index = properties.indexOf(prop);
    if (index !== -1) {
      properties.splice(index, 1);
      context.hasChanges = true;
    }
  }

  function transformDiarizationConfig(objectExpression: any) {
    objectExpression.properties = objectExpression.properties.filter(
      (prop: any) => {
        if (
          isProperty(prop) &&
          prop.key.type === 'Identifier' &&
          prop.key.name === 'enhanced'
        ) {
          context.hasChanges = true;
          return false;
        }
        return true;
      },
    );
  }

  function transformGladiaObject(gladiaObject: any) {
    if (gladiaObject.type !== 'ObjectExpression') return;

    const properties = gladiaObject.properties;

    let languageValue: any = null;
    let enableCodeSwitchingValue: any = null;
    let codeSwitchingLanguagesValue: any = null;
    let existingLanguageConfigProp: any = null;
    let customVocabularyProp: any = null;

    for (const prop of [...properties]) {
      if (!isProperty(prop) || prop.key.type !== 'Identifier') continue;
      const name = prop.key.name;

      switch (name) {
        case 'contextPrompt':
        case 'moderation':
        case 'chapterization':
        case 'nameConsistency':
        case 'structuredDataExtraction':
        case 'structuredDataExtractionConfig':
        case 'displayMode':
        case 'detectLanguage':
          removeProperty(properties, prop);
          break;
        case 'enableCodeSwitching':
          enableCodeSwitchingValue = prop.value;
          removeProperty(properties, prop);
          break;
        case 'language':
          languageValue = prop.value;
          removeProperty(properties, prop);
          break;
        case 'codeSwitchingConfig':
          if (prop.value.type === 'ObjectExpression') {
            for (const nested of prop.value.properties) {
              if (
                isProperty(nested) &&
                nested.key.type === 'Identifier' &&
                nested.key.name === 'languages'
              ) {
                codeSwitchingLanguagesValue = nested.value;
              }
            }
          }
          removeProperty(properties, prop);
          break;
        case 'languageConfig':
          existingLanguageConfigProp = prop;
          break;
        case 'customVocabulary':
          customVocabularyProp = prop;
          break;
        case 'diarizationConfig':
          if (prop.value.type === 'ObjectExpression') {
            transformDiarizationConfig(prop.value);
          }
          break;
      }
    }

    if (
      customVocabularyProp &&
      customVocabularyProp.value.type === 'ArrayExpression'
    ) {
      const vocabularyArray = customVocabularyProp.value;
      customVocabularyProp.value = j.literal(true);

      const existingConfig = properties.find(
        (property: any) =>
          isProperty(property) &&
          getKeyName(property) === 'customVocabularyConfig',
      );

      if (existingConfig && existingConfig.value.type === 'ObjectExpression') {
        const vocabularyProperty = existingConfig.value.properties.find(
          (property: any) =>
            isProperty(property) && getKeyName(property) === 'vocabulary',
        );

        if (vocabularyProperty) {
          vocabularyProperty.value = vocabularyArray;
        } else {
          existingConfig.value.properties.push(
            j.property('init', j.identifier('vocabulary'), vocabularyArray),
          );
        }
      } else {
        properties.push(
          j.property(
            'init',
            j.identifier('customVocabularyConfig'),
            j.objectExpression([
              j.property('init', j.identifier('vocabulary'), vocabularyArray),
            ]),
          ),
        );
      }

      context.hasChanges = true;
    }

    const languageConfigProps: any[] = [];

    if (languageValue) {
      languageConfigProps.push(
        j.property(
          'init',
          j.identifier('languages'),
          j.arrayExpression([languageValue]),
        ),
      );
    } else if (codeSwitchingLanguagesValue) {
      languageConfigProps.push(
        j.property(
          'init',
          j.identifier('languages'),
          codeSwitchingLanguagesValue,
        ),
      );
    }

    const shouldEnableCodeSwitching =
      (enableCodeSwitchingValue?.type === 'BooleanLiteral' &&
        enableCodeSwitchingValue.value === true) ||
      codeSwitchingLanguagesValue != null;

    if (shouldEnableCodeSwitching) {
      languageConfigProps.push(
        j.property('init', j.identifier('codeSwitching'), j.literal(true)),
      );
    }

    if (languageConfigProps.length === 0) {
      return;
    }

    if (
      existingLanguageConfigProp &&
      existingLanguageConfigProp.value.type === 'ObjectExpression'
    ) {
      const existingProperties = existingLanguageConfigProp.value.properties;

      for (const newProperty of languageConfigProps) {
        const key = getKeyName(newProperty);
        if (!key) continue;

        const existingIndex = existingProperties.findIndex(
          (property: any) => getKeyName(property) === key,
        );

        if (existingIndex === -1) {
          existingProperties.push(newProperty);
        }
      }
    } else {
      properties.push(
        j.property(
          'init',
          j.identifier('languageConfig'),
          j.objectExpression(languageConfigProps),
        ),
      );
    }

    context.hasChanges = true;
  }

  root.find(j.ObjectExpression).forEach(objectPath => {
    objectPath.node.properties.forEach((prop: any) => {
      if (
        isProperty(prop) &&
        prop.key.type === 'Identifier' &&
        prop.key.name === 'providerOptions' &&
        prop.value.type === 'ObjectExpression'
      ) {
        prop.value.properties.forEach((providerProp: any) => {
          if (
            isProperty(providerProp) &&
            providerProp.key.type === 'Identifier' &&
            providerProp.key.name === 'gladia' &&
            providerProp.value.type === 'ObjectExpression'
          ) {
            transformGladiaObject(providerProp.value);
          }
        });
      }
    });
  });
});
