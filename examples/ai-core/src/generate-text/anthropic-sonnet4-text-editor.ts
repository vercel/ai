import 'dotenv/config';
import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';

async function main() {
  // In-memory file system to store our story files
  const fileSystem = new Map<string, string>();

  // Create the text editor tool with max_characters limit
  const textEditorTool = anthropic.tools.textEditor_20250728({
    max_characters: 5000, // Limit file viewing to 5000 characters
    execute: async ({
      command,
      path,
      file_text,
      insert_line,
      new_str,
      old_str,
      view_range,
    }) => {
      switch (command) {
        case 'view':
          const content = fileSystem.get(path);
          if (!content) {
            return `Error: File "${path}" not found`;
          }

          if (view_range && view_range.length === 2) {
            const lines = content.split('\n');
            const [start, end] = view_range;
            const endLine = end === -1 ? lines.length : end;
            const selectedLines = lines.slice(start - 1, endLine);
            return selectedLines.join('\n');
          }
          return content;

        case 'create':
          fileSystem.set(path, file_text || '');
          return `File created successfully: ${path}`;

        case 'str_replace':
          const existingContent = fileSystem.get(path);
          if (!existingContent) {
            return `Error: File "${path}" not found`;
          }

          if (!existingContent.includes(old_str || '')) {
            return `Error: Text "${old_str}" not found in file`;
          }

          const occurrences = (
            existingContent.match(
              new RegExp(
                (old_str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
                'g',
              ),
            ) || []
          ).length;
          if (occurrences > 1) {
            return `Error: Found ${occurrences} matches for "${old_str}". Please be more specific.`;
          }

          const newContent = existingContent.replace(
            old_str || '',
            new_str || '',
          );
          fileSystem.set(path, newContent);
          return `Successfully replaced text in ${path}`;

        case 'insert':
          const fileContent = fileSystem.get(path);
          if (!fileContent) {
            return `Error: File "${path}" not found`;
          }

          const lines = fileContent.split('\n');
          lines.splice(insert_line || 0, 0, new_str || '');
          const updatedContent = lines.join('\n');
          fileSystem.set(path, updatedContent);
          return `Successfully inserted text at line ${insert_line} in ${path}`;

        default:
          return `Unknown command: ${command}`;
      }
    },
  });

  console.log('🎭 Starting story creation with Claude Sonnet 4...\n');

  // Step 1: Create initial story
  const initialResult = await generateText({
    model: anthropic('claude-sonnet-4-20250514'),
    prompt: `You are a creative writer. Please create a short story (about 300-400 words) about a robot who discovers emotions. 
    
    Save this story to a file called "robot_story.txt". The story should have:
    - An engaging title
    - A clear beginning, middle, and end
    - Vivid descriptions
    - A meaningful conclusion about what it means to feel emotions`,
    tools: {
      str_replace_based_edit_tool: textEditorTool,
    },
  });

  console.log('📝 Initial story creation:');
  console.log(initialResult.text);
  console.log('\n' + '='.repeat(50) + '\n');

  // Step 2: Review and improve the story
  const improvementResult = await generateText({
    model: anthropic('claude-sonnet-4-20250514'),
    prompt: `Please read the story you just created in "robot_story.txt" and make the following improvements:

    1. Add more sensory details to make the scenes more vivid
    2. Enhance the emotional journey of the robot character
    3. Add a subplot about the robot's relationship with a human character
    4. Improve the dialogue to make it more natural and engaging
    
    After making these improvements, save the updated version to "robot_story_improved.txt"`,
    tools: {
      str_replace_based_edit_tool: textEditorTool,
    },
  });

  console.log('✨ Story improvement:');
  console.log(improvementResult.text);
  console.log('\n' + '='.repeat(50) + '\n');

  // Step 3: Create a sequel
  const sequelResult = await generateText({
    model: anthropic('claude-sonnet-4-20250514'),
    prompt: `Now create a sequel to the robot story. First, read the improved story from "robot_story_improved.txt" to understand the characters and setting.
    
    Then create a sequel story that:
    - Continues 6 months after the original story
    - Shows how the robot has grown emotionally
    - Introduces a new challenge or conflict
    - Explores deeper themes about consciousness and humanity
    
    Save this sequel as "robot_story_sequel.txt"`,
    tools: {
      str_replace_based_edit_tool: textEditorTool,
    },
  });

  console.log('📖 Sequel creation:');
  console.log(sequelResult.text);
  console.log('\n' + '='.repeat(50) + '\n');

  // Step 4: Create a summary document
  const summaryResult = await generateText({
    model: anthropic('claude-sonnet-4-20250514'),
    prompt: `Please create a summary document that includes:
    
    1. A brief synopsis of both stories
    2. Character development analysis
    3. Key themes explored
    4. Writing techniques used
    
    Read both "robot_story_improved.txt" and "robot_story_sequel.txt" to create this analysis.
    Save the summary as "story_analysis.txt"`,
    tools: {
      str_replace_based_edit_tool: textEditorTool,
    },
  });

  console.log('📊 Story analysis:');
  console.log(summaryResult.text);
  console.log('\n' + '='.repeat(50) + '\n');

  // Display final file contents from in-memory storage
  console.log('📁 Final story files created in memory:');
  fileSystem.forEach((content, filename) => {
    console.log(`\n--- ${filename} ---`);
    console.log(
      content.substring(0, 200) + (content.length > 200 ? '...' : ''),
    );
  });

  console.log(
    `\n✅ Story creation complete! ${fileSystem.size} files created in memory.`,
  );

  // Optional: Log all file names
  console.log('📋 Files created:', Array.from(fileSystem.keys()).join(', '));
}

main().catch(console.error);
