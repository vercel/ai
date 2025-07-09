import fs from 'fs';
import path from 'path';

// Read actual codemod files from the filesystem
const codemodsDir = path.join(process.cwd(), 'src', 'codemods');

if (!fs.existsSync(codemodsDir)) {
  throw new Error(`Codemods directory not found: ${codemodsDir}`);
}

const codemodFiles = fs.readdirSync(codemodsDir)
  .filter(file => file.endsWith('.ts') && !file.includes('lib/'))
  .map(file => file.replace('.ts', ''))
  .sort();

// Simple auto-description generator
function generateDescription(name: string): string {
  const readable = name.replace(/-/g, ' ');
  
  if (name.startsWith('remove-')) {
    return `Removes ${readable.replace('remove ', '')}`;
  }
  
  if (name.startsWith('replace-')) {
    return `Replaces ${readable.replace('replace ', '')}`;
  }
  
  if (name.startsWith('rename-')) {
    return `Renames ${readable.replace('rename ', '')}`;
  }
  
  if (name.startsWith('rewrite-')) {
    return `Rewrites ${readable.replace('rewrite ', '')}`;
  }
  
  return `Transforms ${readable}`;
}

// Simple auto-categorization
function categorizeCodemod(name: string): string {
  if (name.includes('facade') || name.includes('baseurl')) {
    return 'Provider Changes';
  }
  
  if (name.includes('experimental-ai') || name.includes('registry') || 
      name.includes('continuation') || name.includes('roundtrip') || 
      name.includes('token-usage')) {
    return 'Core API Changes';
  }
  
  if (name.includes('stream') || name.includes('part')) {
    return 'Streaming and Response Changes';
  }
  
  if (name.includes('framework') || name.includes('useassistant') || 
      name.includes('message-types') || name.includes('tool') ||
      name.includes('chat') || name.includes('ui')) {
    return 'UI Framework Changes';
  }
  
  return 'Utility and Helper Changes';
}

// Group codemods by category
const categories: Record<string, Array<{ name: string; description: string }>> = {};

codemodFiles.forEach(codemod => {
  const category = categorizeCodemod(codemod);
  const description = generateDescription(codemod);
  
  if (!categories[category]) {
    categories[category] = [];
  }
  
  categories[category].push({ name: codemod, description });
});

// Define consistent category order
const categoryOrder = [
  'Provider Changes',
  'Core API Changes',
  'Streaming and Response Changes', 
  'UI Framework Changes',
  'Utility and Helper Changes'
];

function generateCategoryTable(categoryName: string, codemods: Array<{ name: string; description: string }>) {
  const header = `### ${categoryName}

| Codemod | Description |
| ------- | ----------- |`;
  
  const rows = codemods
    .map(codemod => `| \`${codemod.name}\` | ${codemod.description} |`)
    .join('\n');
  
  return `${header}\n${rows}`;
}

const availableCodemodsSection = `## Available Codemods

${categoryOrder
  .filter(categoryName => categories[categoryName])
  .map(categoryName => generateCategoryTable(categoryName, categories[categoryName]))
  .join('\n\n')}`;

const readmePath = path.join(process.cwd(), 'README.md');
const readmeContent = fs.readFileSync(readmePath, 'utf8');

const startMarker = '## Available Codemods';
const endMarker = '## CLI Options';

const startIndex = readmeContent.indexOf(startMarker);
const endIndex = readmeContent.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
  throw new Error('Could not find Available Codemods section markers in README.md');
}

const newReadmeContent = 
  readmeContent.substring(0, startIndex) + 
  availableCodemodsSection + '\n\n' +
  readmeContent.substring(endIndex);

fs.writeFileSync(readmePath, newReadmeContent);

console.log('README.md updated with current codemods'); 