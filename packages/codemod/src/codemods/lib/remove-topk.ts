import { API, FileInfo, JSCodeshift } from 'jscodeshift';

export function removeTopK(fileInfo: FileInfo, api: API, providerName: string) {
  const j: JSCodeshift = api.jscodeshift;
  const root = j(fileInfo.source);
  const topKByVariable = new Map<string, number>();

  // Find provider initializations
  root
    .find(j.CallExpression, {
      callee: {
        type: 'Identifier',
        name: providerName,
      },
    })
    .forEach(path => {
      const args = path.node.arguments[0];
      if (args?.type === 'ObjectExpression') {
        const topKProp = args.properties.find(
          (p: any) => p.key?.name === 'topK',
        );

        if (
          topKProp &&
          topKProp.type === 'ObjectProperty' &&
          topKProp.value.type === 'NumericLiteral'
        ) {
          const varName = path.parent.node.id.name;
          const topKValue = topKProp.value.value;
          topKByVariable.set(varName, topKValue);

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
        name: (p: string) => ['generateText', 'streamText'].includes(p),
      },
    })
    .forEach(path => {
      const args = path.node.arguments[0];
      if (args?.type === 'ObjectExpression') {
        const modelProp = args.properties.find(
          (p: any) => p.key?.name === 'model',
        );

        if (
          modelProp?.type === 'ObjectProperty' &&
          modelProp.value.type === 'CallExpression' &&
          modelProp.value.callee.type === 'Identifier'
        ) {
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
