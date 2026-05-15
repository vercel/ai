import { createTransformer } from '../lib/create-transformer';

const AI_RESULT_FUNCTIONS = ['generateText', 'streamText'];
const AI_RESULT_TYPES = ['GenerateTextResult', 'StreamTextResult'];
const AI_STEP_TYPES = ['StepResult'];
const STEP_ARRAY_METHODS = [
  'every',
  'filter',
  'find',
  'flatMap',
  'forEach',
  'map',
  'some',
];
const STEP_REDUCER_METHODS = ['reduce', 'reduceRight'];

type ReasoningContext = 'result' | 'step';

export default createTransformer((fileInfo, api, options, context) => {
  const { j, root } = context;

  const aiResultFunctions = new Set<string>();
  const aiResultTypes = new Set<string>();
  const aiStepTypes = new Set<string>();
  const aiNamespaces = new Set<string>();

  root
    .find(j.ImportDeclaration, {
      source: { value: 'ai' },
    })
    .forEach(path => {
      path.node.specifiers?.forEach(specifier => {
        if (specifier.type === 'ImportNamespaceSpecifier') {
          if (specifier.local != null) {
            aiNamespaces.add(specifier.local.name);
          }
          return;
        }

        if (
          specifier.type !== 'ImportSpecifier' ||
          specifier.imported.type !== 'Identifier'
        ) {
          return;
        }

        const importedName = specifier.imported.name;
        const localName = specifier.local?.name ?? importedName;

        if (AI_RESULT_FUNCTIONS.includes(importedName)) {
          aiResultFunctions.add(localName);
        } else if (AI_RESULT_TYPES.includes(importedName)) {
          aiResultTypes.add(localName);
        } else if (AI_STEP_TYPES.includes(importedName)) {
          aiStepTypes.add(localName);
        }
      });
    });

  const resultIdentifiers = new Set<string>();
  const stepsIdentifiers = new Set<string>();
  const stepIdentifiers = new Set<string>();

  function getPropertyName(property: any): string | null {
    if (property.type === 'Identifier') return property.name;
    if (property.type === 'StringLiteral') return property.value;
    if (property.type === 'Literal' && typeof property.value === 'string') {
      return property.value;
    }
    return null;
  }

  function getPropertyKeyName(property: any): string | null {
    if (property.type !== 'ObjectProperty' && property.type !== 'Property') {
      return null;
    }
    return getPropertyName(property.key);
  }

  function setPropertyName(property: any, name: string) {
    if (property.type === 'Identifier') {
      property.name = name;
    } else if (property.type === 'StringLiteral') {
      property.value = name;
    } else if (property.type === 'Literal') {
      property.value = name;
    }
  }

  function renamedPropertyName(
    name: string,
    reasoningContext: ReasoningContext,
  ): string | null {
    if (name === 'reasoning') return 'reasoningText';
    if (reasoningContext === 'result' && name === 'reasoningDetails') {
      return 'reasoning';
    }
    return null;
  }

  function isAiResultCall(node: any): boolean {
    const expression = node?.type === 'AwaitExpression' ? node.argument : node;
    if (expression?.type !== 'CallExpression') return false;

    const { callee } = expression;
    if (callee.type === 'Identifier') {
      return aiResultFunctions.has(callee.name);
    }

    return (
      callee.type === 'MemberExpression' &&
      callee.object.type === 'Identifier' &&
      aiNamespaces.has(callee.object.name) &&
      getPropertyName(callee.property) != null &&
      AI_RESULT_FUNCTIONS.includes(getPropertyName(callee.property)!)
    );
  }

  function isTypeNameReferenceTo(
    typeName: any,
    localNames: Set<string>,
    importedNames: readonly string[],
  ): boolean {
    if (typeName.type === 'Identifier') {
      return localNames.has(typeName.name);
    }

    return (
      typeName.type === 'TSQualifiedName' &&
      typeName.left.type === 'Identifier' &&
      aiNamespaces.has(typeName.left.name) &&
      typeName.right.type === 'Identifier' &&
      importedNames.includes(typeName.right.name)
    );
  }

  function isExpressionReferenceTo(
    expression: any,
    localNames: Set<string>,
    importedNames: readonly string[],
  ): boolean {
    if (expression.type === 'Identifier') {
      return localNames.has(expression.name);
    }

    return (
      expression.type === 'MemberExpression' &&
      expression.object.type === 'Identifier' &&
      aiNamespaces.has(expression.object.name) &&
      getPropertyName(expression.property) != null &&
      importedNames.includes(getPropertyName(expression.property)!)
    );
  }

  function isTypeReferenceTo(
    typeAnnotation: any,
    localNames: Set<string>,
    importedNames: readonly string[],
  ): boolean {
    const annotation =
      typeAnnotation?.type === 'TSTypeAnnotation'
        ? typeAnnotation.typeAnnotation
        : typeAnnotation;

    if (!annotation) return false;

    if (annotation.type === 'TSTypeReference') {
      return isTypeNameReferenceTo(
        annotation.typeName,
        localNames,
        importedNames,
      );
    }

    if (annotation.type === 'TSUnionType') {
      return annotation.types.some((type: any) =>
        isTypeReferenceTo(type, localNames, importedNames),
      );
    }

    return false;
  }

  function isResultType(typeAnnotation: any): boolean {
    return isTypeReferenceTo(typeAnnotation, aiResultTypes, AI_RESULT_TYPES);
  }

  function isStepType(typeAnnotation: any): boolean {
    return isTypeReferenceTo(typeAnnotation, aiStepTypes, AI_STEP_TYPES);
  }

  function collectStepsFromPattern(pattern: any) {
    if (pattern?.type !== 'ObjectPattern') return;

    pattern.properties.forEach((property: any) => {
      if (getPropertyKeyName(property) !== 'steps') return;

      if (property.value?.type === 'Identifier') {
        stepsIdentifiers.add(property.value.name);
      } else if (
        property.value?.type === 'AssignmentPattern' &&
        property.value.left.type === 'Identifier'
      ) {
        stepsIdentifiers.add(property.value.left.name);
      }
    });
  }

  root.find(j.VariableDeclarator).forEach(path => {
    const { id, init } = path.node;

    if (id.type === 'Identifier') {
      if (isAiResultCall(init) || isResultType(id.typeAnnotation)) {
        resultIdentifiers.add(id.name);
      } else if (isStepType(id.typeAnnotation)) {
        stepIdentifiers.add(id.name);
      }
      return;
    }

    if (isAiResultCall(init)) {
      collectStepsFromPattern(id);
    }
  });

  root.find(j.AssignmentExpression).forEach(path => {
    if (
      path.node.left.type === 'Identifier' &&
      isAiResultCall(path.node.right)
    ) {
      resultIdentifiers.add(path.node.left.name);
    }
  });

  root.find(j.FunctionDeclaration).forEach(path => {
    path.node.params.forEach(param => {
      if (param.type !== 'Identifier') return;
      if (isResultType(param.typeAnnotation)) {
        resultIdentifiers.add(param.name);
      } else if (isStepType(param.typeAnnotation)) {
        stepIdentifiers.add(param.name);
      }
    });
  });

  function isKnownResultExpression(node: any): boolean {
    if (node.type === 'Identifier') {
      return resultIdentifiers.has(node.name);
    }
    return isAiResultCall(node);
  }

  function isStepsExpression(node: any): boolean {
    return (
      (node.type === 'Identifier' && stepsIdentifiers.has(node.name)) ||
      (node.type === 'MemberExpression' &&
        isKnownResultExpression(node.object) &&
        getPropertyName(node.property) === 'steps')
    );
  }

  function isKnownStepExpression(node: any): boolean {
    if (node.type === 'Identifier') {
      return stepIdentifiers.has(node.name);
    }

    return (
      node.type === 'MemberExpression' &&
      ((isKnownResultExpression(node.object) &&
        getPropertyName(node.property) === 'finalStep') ||
        isStepsExpression(node.object))
    );
  }

  function collectStepIdentifierFromFunction(functionNode: any, index = 0) {
    const param = functionNode.params?.[index];
    if (param?.type === 'Identifier') {
      stepIdentifiers.add(param.name);
    }
  }

  root.find(j.CallExpression).forEach(path => {
    const { callee, arguments: args } = path.node;

    if (
      callee.type !== 'MemberExpression' ||
      !isStepsExpression(callee.object)
    ) {
      return;
    }

    const methodName = getPropertyName(callee.property);

    if (methodName != null && STEP_ARRAY_METHODS.includes(methodName)) {
      collectStepIdentifierFromFunction(args[0]);
    } else if (
      methodName != null &&
      STEP_REDUCER_METHODS.includes(methodName)
    ) {
      collectStepIdentifierFromFunction(args[0], 1);
    }
  });

  root.find(j.ForOfStatement).forEach(path => {
    if (!isStepsExpression(path.node.right)) return;

    const stepVariable = path.node.left;
    if (stepVariable.type === 'Identifier') {
      stepIdentifiers.add(stepVariable.name);
    } else if (stepVariable.type === 'VariableDeclaration') {
      const declaration = stepVariable.declarations[0] as any;
      if (declaration?.id.type === 'Identifier') {
        stepIdentifiers.add(declaration.id.name);
      }
    }
  });

  function renameMemberExpression(
    path: any,
    reasoningContext: ReasoningContext,
  ) {
    const propertyName = getPropertyName(path.node.property);
    if (propertyName == null) return;

    const newName = renamedPropertyName(propertyName, reasoningContext);
    if (newName == null) return;

    setPropertyName(path.node.property, newName);
    context.hasChanges = true;
  }

  root.find(j.MemberExpression).forEach(path => {
    if (isKnownResultExpression(path.node.object)) {
      renameMemberExpression(path, 'result');
    } else if (isKnownStepExpression(path.node.object)) {
      renameMemberExpression(path, 'step');
    }
  });

  function renameObjectPattern(path: any, reasoningContext: ReasoningContext) {
    path.node.properties.forEach((property: any) => {
      const propertyName = getPropertyKeyName(property);
      if (propertyName == null) return;

      const newName = renamedPropertyName(propertyName, reasoningContext);
      if (newName == null) return;

      if (property.shorthand) {
        property.shorthand = false;
        property.value = j.identifier(propertyName);
      }

      setPropertyName(property.key, newName);
      context.hasChanges = true;
    });
  }

  function getObjectPatternContext(path: any): ReasoningContext | null {
    const parent = path.parent.node;

    if (parent.type === 'VariableDeclarator' && parent.id === path.node) {
      if (isKnownResultExpression(parent.init)) return 'result';
      if (isKnownStepExpression(parent.init)) return 'step';
    }

    if (isResultType(path.node.typeAnnotation)) return 'result';
    if (isStepType(path.node.typeAnnotation)) return 'step';

    if (
      parent.type === 'ArrowFunctionExpression' ||
      parent.type === 'FunctionExpression'
    ) {
      const callExpression = path.parent.parent?.node;
      if (
        callExpression?.type === 'CallExpression' &&
        callExpression.callee.type === 'MemberExpression' &&
        getPropertyName(callExpression.callee.property) === 'forEach' &&
        isStepsExpression(callExpression.callee.object)
      ) {
        return 'step';
      }
    }

    return null;
  }

  root.find(j.ObjectPattern).forEach(path => {
    const reasoningContext = getObjectPatternContext(path);
    if (reasoningContext == null) return;

    renameObjectPattern(path, reasoningContext);
  });

  function getObjectExpressionContext(path: any): ReasoningContext | null {
    const parent = path.parent.node;

    if (parent.type === 'VariableDeclarator' && parent.init === path.node) {
      if (isResultType(parent.id.typeAnnotation)) return 'result';
      if (isStepType(parent.id.typeAnnotation)) return 'step';
    }

    if (
      (parent.type === 'TSAsExpression' ||
        parent.type === 'TSSatisfiesExpression' ||
        parent.type === 'TSTypeAssertion') &&
      parent.expression === path.node
    ) {
      if (isResultType(parent.typeAnnotation)) return 'result';
      if (isStepType(parent.typeAnnotation)) return 'step';
    }

    return null;
  }

  root.find(j.ObjectExpression).forEach(path => {
    const reasoningContext = getObjectExpressionContext(path);
    if (reasoningContext == null) return;

    path.node.properties.forEach((property: any) => {
      const propertyName = getPropertyKeyName(property);
      if (propertyName == null) return;

      const newName = renamedPropertyName(propertyName, reasoningContext);
      if (newName == null) return;

      setPropertyName(property.key, newName);
      context.hasChanges = true;
    });
  });

  function getInterfaceContext(path: any): ReasoningContext | null {
    const interfaces = path.node.extends ?? [];

    if (
      interfaces.some((typeReference: any) =>
        isExpressionReferenceTo(
          typeReference.expression,
          aiResultTypes,
          AI_RESULT_TYPES,
        ),
      )
    ) {
      return 'result';
    }

    if (
      interfaces.some((typeReference: any) =>
        isExpressionReferenceTo(
          typeReference.expression,
          aiStepTypes,
          AI_STEP_TYPES,
        ),
      )
    ) {
      return 'step';
    }

    return null;
  }

  root.find(j.TSInterfaceDeclaration).forEach(path => {
    const reasoningContext = getInterfaceContext(path);
    if (reasoningContext == null) return;

    path.node.body.body.forEach((member: any) => {
      if (member.type !== 'TSPropertySignature') return;

      const propertyName = getPropertyName(member.key);
      if (propertyName == null) return;

      const newName = renamedPropertyName(propertyName, reasoningContext);
      if (newName == null) return;

      setPropertyName(member.key, newName);
      context.hasChanges = true;
    });
  });
});
