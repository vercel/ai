import { createTransformer } from '../lib/create-transformer';

function getName(node: any): string | undefined {
  if (node?.type === 'Identifier') return node.name;
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

const AI_SDK_CALL_NAMES = new Set([
  'generateText',
  'streamText',
  'generateObject',
  'streamObject',
  'Agent',
  'createAgent',
  'experimental_repairToolCall',
  'repairToolCall',
]);

const AI_PROMPT_SIBLINGS = new Set([
  'model',
  'prompt',
  'messages',
  'tools',
  'prepareStep',
  'stopWhen',
  'maxSteps',
  'maxTokens',
  'maxOutputTokens',
  'temperature',
  'topP',
  'topK',
  'presencePenalty',
  'frequencyPenalty',
  'seed',
  'abortSignal',
  'headers',
  'experimental_telemetry',
  'experimental_repairToolCall',
  'repairToolCall',
  'onStart',
  'onStepStart',
  'onStepFinish',
  'onFinish',
  'onEnd',
]);

const AI_CALLBACK_NAMES = new Set([
  'onStart',
  'onStepStart',
  'onStepFinish',
  'onFinish',
  'onEnd',
  'prepareStep',
  'experimental_repairToolCall',
  'repairToolCall',
]);

export default createTransformer((fileInfo, api, options, context) => {
  const { j, root } = context;

  // 1. Verify that the file imports from 'ai' or '@ai-sdk/*'
  let importsAi = false;
  const aiImportedNames = new Set<string>();

  root.find(j.ImportDeclaration).forEach(path => {
    const source = path.node.source.value;
    if (
      typeof source === 'string' &&
      (source === 'ai' || source.startsWith('@ai-sdk/'))
    ) {
      importsAi = true;
      path.node.specifiers?.forEach(specifier => {
        if (specifier.type === 'ImportSpecifier') {
          const localName = specifier.local?.name || specifier.imported.name;
          aiImportedNames.add(localName);
        } else if (
          specifier.type === 'ImportNamespaceSpecifier' ||
          specifier.type === 'ImportDefaultSpecifier'
        ) {
          if (specifier.local?.name) {
            aiImportedNames.add(specifier.local.name);
          }
        }
      });
    }
  });

  // Also check require('ai') or require('@ai-sdk/*')
  root
    .find(j.CallExpression, {
      callee: { name: 'require' },
    })
    .forEach(path => {
      const arg = path.node.arguments[0];
      if (
        arg &&
        (arg.type === 'Literal' || arg.type === 'StringLiteral') &&
        typeof arg.value === 'string' &&
        (arg.value === 'ai' || arg.value.startsWith('@ai-sdk/'))
      ) {
        importsAi = true;
      }
    });

  if (!importsAi) {
    return;
  }

  // 2. Identify variables passed as arguments to AI SDK function calls
  const aiOptionsVarNames = new Set<string>();

  function checkCallee(callee: any): boolean {
    if (!callee) return false;
    if (callee.type === 'Identifier') {
      return (
        AI_SDK_CALL_NAMES.has(callee.name) || aiImportedNames.has(callee.name)
      );
    }
    if (
      callee.type === 'MemberExpression' &&
      callee.property?.type === 'Identifier'
    ) {
      return AI_SDK_CALL_NAMES.has(callee.property.name);
    }
    return false;
  }

  root.find(j.CallExpression).forEach(path => {
    if (checkCallee(path.node.callee)) {
      const firstArg = path.node.arguments[0];
      if (firstArg?.type === 'Identifier') {
        aiOptionsVarNames.add(firstArg.name);
      }
    }
  });

  root.find(j.NewExpression).forEach(path => {
    if (checkCallee(path.node.callee)) {
      const firstArg = path.node.arguments[0];
      if (firstArg?.type === 'Identifier') {
        aiOptionsVarNames.add(firstArg.name);
      }
    }
  });

  // 3. Helper to determine if an ObjectExpression is an AI SDK options object
  function isAiOptionsObject(path: any): boolean {
    // Check if directly passed to an AI SDK CallExpression or NewExpression
    const parentNode = path.parent?.node;
    if (
      parentNode &&
      (parentNode.type === 'CallExpression' ||
        parentNode.type === 'NewExpression')
    ) {
      if (
        parentNode.arguments?.[0] === path.node &&
        checkCallee(parentNode.callee)
      ) {
        return true;
      }
    }

    // Check if assigned to an identified AI options variable
    if (
      parentNode?.type === 'VariableDeclarator' &&
      parentNode.id?.type === 'Identifier' &&
      aiOptionsVarNames.has(parentNode.id.name)
    ) {
      return true;
    }

    // Check if it has characteristic AI prompt sibling properties
    const propertyNames = new Set<string>();
    path.node.properties.forEach((prop: any) => {
      if (prop.type === 'Property' || prop.type === 'ObjectProperty') {
        const name = getName(prop.key);
        if (name) {
          propertyNames.add(name);
        }
      }
    });

    if (propertyNames.has('system')) {
      for (const sibling of AI_PROMPT_SIBLINGS) {
        if (propertyNames.has(sibling)) {
          return true;
        }
      }
    }

    return false;
  }

  // 4. Transform callback parameters and bodies
  function transformCallback(fnNode: any) {
    if (
      fnNode.type !== 'ArrowFunctionExpression' &&
      fnNode.type !== 'FunctionExpression'
    ) {
      return;
    }

    // Transform parameters like ({ system }: any) => ...
    fnNode.params.forEach((param: any) => {
      if (param.type === 'ObjectPattern') {
        param.properties.forEach((prop: any) => {
          if (
            (prop.type === 'Property' || prop.type === 'ObjectProperty') &&
            getName(prop.key) === 'system'
          ) {
            if (prop.shorthand) {
              prop.shorthand = false;
              prop.value = j.identifier('system');
            }
            setName(prop.key, 'instructions');
            context.hasChanges = true;
          }
        });
      } else if (param.type === 'Identifier') {
        // e.g. (event) => { console.log(event.system); }
        const paramName = param.name;
        j(fnNode.body)
          .find(j.MemberExpression)
          .forEach(memPath => {
            if (
              memPath.node.object.type === 'Identifier' &&
              memPath.node.object.name === paramName &&
              getName(memPath.node.property) === 'system'
            ) {
              setName(memPath.node.property, 'instructions');
              context.hasChanges = true;
            }
          });
      }
    });

    // For prepareStep and callbacks, also transform any returned ObjectExpression with system
    function handleCallbackObject(objNode: any) {
      objNode.properties?.forEach((prop: any) => {
        if (
          (prop.type === 'Property' || prop.type === 'ObjectProperty') &&
          getName(prop.key) === 'system'
        ) {
          if (prop.shorthand) {
            prop.shorthand = false;
            prop.value = j.identifier('system');
          }
          setName(prop.key, 'instructions');
          context.hasChanges = true;
        }
      });
    }

    if (fnNode.body.type === 'ObjectExpression') {
      handleCallbackObject(fnNode.body);
    } else {
      j(fnNode.body)
        .find(j.ObjectExpression)
        .forEach(objPath => {
          handleCallbackObject(objPath.node);
        });
    }
  }

  // 5. Transform AI SDK options objects
  root.find(j.ObjectExpression).forEach(path => {
    if (!isAiOptionsObject(path)) {
      return;
    }

    path.node.properties.forEach((property: any) => {
      if (property.type !== 'Property' && property.type !== 'ObjectProperty') {
        return;
      }

      const propName = getName(property.key);
      if (propName === 'system') {
        if (property.shorthand) {
          property.shorthand = false;
          property.value = j.identifier('system');
        }
        setName(property.key, 'instructions');
        context.hasChanges = true;
      } else if (propName && AI_CALLBACK_NAMES.has(propName)) {
        transformCallback(property.value);
      }
    });
  });
});
