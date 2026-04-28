import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { createMCPClient, MCPClient } from '@ai-sdk/mcp';
import 'dotenv/config';

/**
 * Convo MCP — Meeting Intelligence for AI SDK
 *
 * Connects to Convo's remote MCP server (Streamable HTTP with Bearer auth)
 * to give AI agents access to meeting data: transcripts, summaries, action
 * items, coaching feedback, and cross-meeting intelligence.
 *
 * Convo is an AI meeting assistant for macOS and Windows. It works across
 * Zoom, Google Meet, Teams, Slack, and WebEx without joining the call as a
 * bot. Audio is processed locally on the user's device.
 *
 * Remote MCP endpoint: https://www.itsconvo.com/api/mcp
 * npm package (stdio):  @itsconvo/mcp-server
 * API docs:             https://docs.itsconvo.com
 * OpenAPI spec:         https://www.itsconvo.com/openapi.json
 * GitHub:               https://github.com/itsconvo/mcp-server
 *
 * Setup:
 *   1. Download the Convo desktop app at https://www.itsconvo.com (macOS/Windows)
 *   2. Create an account (Starter plan or above required for API access)
 *   3. Open the app > Settings > API Keys > Create New Key
 *   4. Set CONVO_API_KEY and OPENAI_API_KEY in .env
 *
 * Remote server tools (7):
 *   meetings.list                  — Search and list meetings by title or date
 *   meetings.get_transcript        — Full transcript with speaker names and timestamps
 *   meetings.get_summary           — Key points, decisions, and action items
 *   meetings.get_feedback          — Communication coaching scores (clarity, listening,
 *                                    time management, collaboration, decision making)
 *   intelligence.prepare           — Briefing from all past meetings with a person/company
 *   intelligence.weekly_digest     — Consolidated digest over a time period
 *   intelligence.find_action_items — Find action items across meetings, filter by owner
 *
 * Remote server prompts (3):
 *   meeting-prep     — Pre-built workflow for meeting preparation
 *   weekly-review    — Consolidated weekly summary
 *   follow-up-blitz  — Draft follow-up emails for recent meetings
 *
 * The local npm package (@itsconvo/mcp-server) exposes 12 tools including
 * meetings.ask, meetings.draft_email, meetings.share, calendar.upcoming,
 * and account.info. These are not yet available on the remote server.
 *
 * Auth: Bearer token via Authorization header. Keys start with "convo_".
 * Tiers: Starter (100 req/hr, 10 AI gen/mo), Professional (500/hr, 100/mo),
 *        Enterprise (2000/hr, unlimited).
 * Rate limit headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset.
 */

async function main() {
  const apiKey = process.env.CONVO_API_KEY;
  if (!apiKey) {
    console.error('Missing CONVO_API_KEY. To get one:');
    console.error('  1. Download the Convo desktop app at https://www.itsconvo.com');
    console.error('  2. Open the app > Settings > API Keys > Create New Key');
    console.error('  Requires Starter plan or above.');
    process.exit(1);
  }

  const mcpClient: MCPClient = await createMCPClient({
    transport: {
      type: 'http',
      url: 'https://www.itsconvo.com/api/mcp',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
  });

  try {
    const tools = await mcpClient.tools();
    console.log('Connected. Tools:', Object.keys(tools).join(', '));

    // Example: find open action items across recent meetings
    const { text: answer } = await generateText({
      model: openai('gpt-4o-mini'),
      tools,
      maxSteps: 10,
      system:
        'You are a meeting assistant with access to the user\'s meeting history. ' +
        'Use the available tools to answer questions. Be concise and actionable. ' +
        'When listing action items, include the owner and which meeting they came from.',
      prompt:
        'Find all my open action items from the last 14 days. ' +
        'Group them by owner and flag anything high priority.',
    });

    console.log(`\n${answer}`);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mcpClient.close();
  }
}

main();
