import { API, FileInfo } from 'jscodeshift';

const attributeMapping = {
  'ai.finishReason': 'ai.response.finishReason',
  'ai.result.object': 'ai.response.object',
  'ai.result.text': 'ai.response.text',
  'ai.result.toolCalls': 'ai.response.toolCalls',
  'ai.stream.msToFirstChunk': 'ai.response.msToFirstChunk',
};

export default function transformer(file: FileInfo, api: API) {
  const j = api.jscodeshift;
  const root = j(file.source);

  // Replace telemetry attributes in property accesses
  root
    .find(j.MemberExpression)
    .filter(path => {
      const prop = path.node.property;
      return (
        prop.type === 'StringLiteral' &&
        Object.keys(attributeMapping).includes(prop.value)
      );
    })
    .forEach(path => {
      if (path.node.property.type === 'StringLiteral') {
        const oldPath = path.node.property.value;
        path.node.property.value =
          attributeMapping[oldPath as keyof typeof attributeMapping];
      }
    });

  // Replace telemetry attributes in object literals
  root
    .find(j.ObjectProperty)
    .filter(
      path =>
        path.node.key.type === 'StringLiteral' &&
        Object.keys(attributeMapping).includes(path.node.key.value),
    )
    .forEach(path => {
      if (path.node.key.type === 'StringLiteral') {
        const oldPath = path.node.key.value;
        path.node.key.value =
          attributeMapping[oldPath as keyof typeof attributeMapping];
      }
    });

  return root.toSource({ quote: 'single' });
}
