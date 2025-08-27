// @ts-nocheck
// Test file for replace-textdelta-with-text codemod

// 1. Member expression cases
const content = delta.text; // Should be transformed
const otherContent = delta.text; // Should NOT be transformed  
const wrongObject = other.textDelta; // Should NOT be transformed (wrong object)
const wrongProperty = delta.otherProperty; // Should NOT be transformed (wrong property)

// 2. Switch case transformations
function handleStreamPart(part: any) {
  switch (part.type) {
    case 'text':
      return processTextDelta(part);
    case 'other-delta':
      return processOther(part);
  }
}

// 3. String literal transformations
const partType = 'text'; // Should be transformed
const otherType = 'text'; // Should NOT be transformed
const anotherType = 'other-delta'; // Should NOT be transformed

// 4. Conditional checks
if (part.type === 'text') { // Should be transformed
  handleTextDelta();
}

if (part.type === 'text') { // Should NOT be transformed
  handleText();
}

// 5. Complex expressions combining multiple patterns
function processStream(parts: any[]) {
  return parts.map(part => {
    if (part.type === 'text') {
      return {
        ...part,
        content: delta.text,
        type: 'text' // This 'text' should NOT be transformed (not 'text-delta')
      };
    }
    return part;
  });
}
