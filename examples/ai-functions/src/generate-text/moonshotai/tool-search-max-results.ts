import {
  generateText,
  isStepCount,
  tool,
  toolSearch,
  type InferToolOutput,
} from 'ai';
import { z } from 'zod/v4';
import { run } from '../../lib/run';

const searchTool = toolSearch({ maxResults: 2 });
const projectTool = (description: string) =>
  tool({
    deferLoading: true,
    description,
    inputSchema: z.object({ projectId: z.string() }),
  });

run(async () => {
  const result = await generateText({
    model: 'moonshotai/kimi-k3',
    tools: {
      tool_search: searchTool,
      createProject: projectTool('Create a project.'),
      updateProject: projectTool('Update a project.'),
      archiveProject: projectTool('Archive a project.'),
      listProjectTasks: projectTool('List tasks for a project.'),
      addProjectMember: projectTool('Add a member to a project.'),
      getProjectStatus: projectTool('Get the status of a project.'),
    },
    toolChoice: { type: 'tool', toolName: 'tool_search' },
    stopWhen: isStepCount(1),
    prompt: 'Call tool_search with the query "project".',
  });

  const searchResult = result.toolResults.find(
    result => result.toolName === 'tool_search',
  );

  if (searchResult?.toolName !== 'tool_search') {
    throw new Error('Expected a tool_search result.');
  }

  console.log(searchResult.output);

  const output = searchResult.output as InferToolOutput<typeof searchTool>;
  if (output.tools.length !== 2) {
    throw new Error('Expected tool_search to return exactly two matches.');
  }
});
