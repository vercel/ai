import { API, FileInfo, JSCodeshift } from 'jscodeshift';

export default function transformer(fileInfo: FileInfo, api: API) {
  const j: JSCodeshift = api.jscodeshift;
  const root = j(fileInfo.source);
  const topKByVariable = new Map<string, number>();

  // Find provider initializations
  root
    .find(j.CallExpression, {
      callee: {
        type: 'Identifier',
        name: 'createGoogleGenerativeAI',
      },
    })
    .forEach(path => {
      const args = path.node.arguments[0];
      if (args?.type === 'ObjectExpression') {
        const topKProp = args.properties.find(
          (p: any) => p.key?.name === 'topK',
        );

        if (topKProp) {
          // Get variable name from parent
          const varName = path.parent.node.id.name;
          const topKValue = topKProp.value.value;
          topKByVariable.set(varName, topKValue);

          // Remove topK property
          args.properties = args.properties.filter(
            (p: any) => p.key?.name !== 'topK',
          );
        }
      }
    });

  // Add topK to API calls
  root
    .find(j.CallExpression, {
      callee: {
        type: 'Identifier',
        name: p => ['generateText', 'streamText'].includes(p),
      },
    })
    .forEach(path => {
      const args = path.node.arguments[0];
      if (args?.type === 'ObjectExpression') {
        const modelProp = args.properties.find(
          (p: any) => p.key?.name === 'model',
        );

        if (modelProp?.value.type === 'CallExpression') {
          const providerVar = modelProp.value.callee.name;
          const topKValue = topKByVariable.get(providerVar);

          if (topKValue !== undefined) {
            args.properties.push(
              j.property(
                'init',
                j.identifier('topK'),
                j.numericLiteral(topKValue),
              ),
            );
          }
        }
      }
    });

  return root.toSource();
}
