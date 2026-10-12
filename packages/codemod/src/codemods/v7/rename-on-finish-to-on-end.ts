import { createTransformer } from '../lib/create-transformer';

const textGenerationFunctions = new Set(['generateText', 'streamText']);
const aiAgentConstructors = new Set(['ToolLoopAgent']);
const workflowAgentConstructors = new Set(['WorkflowAgent']);
const agentMethods = new Set(['generate', 'stream']);
const lifecycleOptionTypes = new Set([
  'AgentCallParameters',
  'AgentStreamParameters',
  'Experimental_AgentSettings',
  'ToolLoopAgentSettings',
  'WorkflowAgentCallOptions',
  'WorkflowAgentGenerateOptions',
  'WorkflowAgentOptions',
  'WorkflowAgentStreamOptions',
]);
const agentTypes = new Set(['Agent', 'ToolLoopAgent', 'WorkflowAgent']);
const telemetryTypes = new Set(['Telemetry']);

function getName(node: any): string | undefined {
  if (node?.type === 'Identifier') {
    return node.name;
  }

  if (node?.type === 'Literal' || node?.type === 'StringLiteral') {
    return typeof node.value === 'string' ? node.value : undefined;
  }
}

function setName(node: any, name: string) {
  if (node.type === 'Identifier') {
    node.name = name;
  } else if (node.type === 'Literal' || node.type === 'StringLiteral') {
    node.value = name;
  }
}

function getTypeName(node: any): string | undefined {
  if (node?.type === 'TSTypeAnnotation') {
    return getTypeName(node.typeAnnotation);
  }

  if (node?.type === 'TSTypeReference') {
    return getName(node.typeName);
  }
}

function unwrapExpression(node: any): any {
  if (
    node?.type === 'TSAsExpression' ||
    node?.type === 'TSSatisfiesExpression' ||
    node?.type === 'TSTypeAssertion'
  ) {
    return unwrapExpression(node.expression);
  }

  return node;
}

export default createTransformer((fileInfo, api, options, context) => {
  const { j, root } = context;
  const generationFunctionNames = new Set<string>();
  const agentConstructorNames = new Set<string>();
  const lifecycleOptionTypeNames = new Set<string>();
  const agentTypeNames = new Set<string>();
  const telemetryTypeNames = new Set<string>();
  const aiNamespaceNames = new Set<string>();
  const workflowNamespaceNames = new Set<string>();
  const objectExpressionsToRename = new Set<any>();

  root.find(j.ImportDeclaration).forEach(path => {
    const source = path.node.source.value;
    if (source !== 'ai' && source !== '@ai-sdk/workflow') {
      return;
    }

    for (const specifier of path.node.specifiers ?? []) {
      if (specifier.type === 'ImportNamespaceSpecifier') {
        const namespaceName = specifier.local?.name;
        if (namespaceName != null) {
          (source === 'ai' ? aiNamespaceNames : workflowNamespaceNames).add(
            namespaceName,
          );
        }
        continue;
      }

      if (specifier.type !== 'ImportSpecifier') {
        continue;
      }

      const importedName = getName(specifier.imported);
      const localName = specifier.local?.name ?? importedName;
      if (importedName == null || localName == null) {
        continue;
      }

      if (source === 'ai' && textGenerationFunctions.has(importedName)) {
        generationFunctionNames.add(localName);
      }

      if (
        (source === 'ai' && aiAgentConstructors.has(importedName)) ||
        (source === '@ai-sdk/workflow' &&
          workflowAgentConstructors.has(importedName))
      ) {
        agentConstructorNames.add(localName);
      }

      if (lifecycleOptionTypes.has(importedName)) {
        lifecycleOptionTypeNames.add(localName);
      }

      if (agentTypes.has(importedName)) {
        agentTypeNames.add(localName);
      }

      if (source === 'ai' && telemetryTypes.has(importedName)) {
        telemetryTypeNames.add(localName);
      }
    }
  });

  const isNamespaceMember = (
    node: any,
    namespaceNames: Set<string>,
    memberNames: Set<string>,
  ) =>
    node?.type === 'MemberExpression' &&
    node.object.type === 'Identifier' &&
    namespaceNames.has(node.object.name) &&
    memberNames.has(getName(node.property) ?? '');

  const isAgentConstructor = (node: any) =>
    (node?.type === 'Identifier' && agentConstructorNames.has(node.name)) ||
    isNamespaceMember(node, aiNamespaceNames, aiAgentConstructors) ||
    isNamespaceMember(node, workflowNamespaceNames, workflowAgentConstructors);

  const hasTargetType = (node: any, names: Set<string>) => {
    const typeName = getTypeName(node);
    return typeName != null && names.has(typeName);
  };

  const isAgentValue = (path: any, node: any) => {
    if (node?.type !== 'Identifier') {
      return false;
    }

    const bindings =
      path.scope.lookup(node.name)?.getBindings()[node.name] ?? [];

    return bindings.some((binding: any) => {
      if (hasTargetType(binding.node.typeAnnotation, agentTypeNames)) {
        return true;
      }

      const declaration = binding.parent?.node;
      const initializer =
        declaration?.type === 'VariableDeclarator'
          ? unwrapExpression(declaration.init)
          : undefined;

      return (
        initializer?.type === 'NewExpression' &&
        isAgentConstructor(initializer.callee)
      );
    });
  };

  const collectObjectExpression = (node: any) => {
    const expression = unwrapExpression(node);
    if (expression?.type === 'ObjectExpression') {
      objectExpressionsToRename.add(expression);
    }
  };

  root.find(j.VariableDeclarator).forEach(path => {
    const { id, init } = path.node;
    if (
      id.type === 'Identifier' &&
      (hasTargetType(id.typeAnnotation, lifecycleOptionTypeNames) ||
        hasTargetType(id.typeAnnotation, telemetryTypeNames))
    ) {
      collectObjectExpression(init);
    }
  });

  root.find(j.CallExpression).forEach(path => {
    const { callee } = path.node;
    const isGenerationFunction =
      (callee.type === 'Identifier' &&
        generationFunctionNames.has(callee.name)) ||
      isNamespaceMember(callee, aiNamespaceNames, textGenerationFunctions);

    const isAgentMethod =
      callee.type === 'MemberExpression' &&
      agentMethods.has(getName(callee.property) ?? '') &&
      (isAgentValue(path, callee.object) ||
        (unwrapExpression(callee.object)?.type === 'NewExpression' &&
          isAgentConstructor(unwrapExpression(callee.object).callee)));

    if (isGenerationFunction || isAgentMethod) {
      collectObjectExpression(path.node.arguments[0]);
    }
  });

  root.find(j.NewExpression).forEach(path => {
    if (isAgentConstructor(path.node.callee)) {
      collectObjectExpression(path.node.arguments[0]);
    }
  });

  root.find(j.ObjectExpression).forEach(path => {
    const parent = path.parent?.node;

    if (
      (parent?.type === 'TSAsExpression' ||
        parent?.type === 'TSSatisfiesExpression' ||
        parent?.type === 'TSTypeAssertion') &&
      (hasTargetType(parent.typeAnnotation, lifecycleOptionTypeNames) ||
        hasTargetType(parent.typeAnnotation, telemetryTypeNames))
    ) {
      objectExpressionsToRename.add(path.node);
    }
  });

  for (const objectExpression of objectExpressionsToRename) {
    objectExpression.properties.forEach((property: any) => {
      if (
        (property.type === 'Property' ||
          property.type === 'ObjectProperty' ||
          property.type === 'ObjectMethod') &&
        getName(property.key) === 'onFinish'
      ) {
        setName(property.key, 'onEnd');
        context.hasChanges = true;
      }
    });
  }
});
