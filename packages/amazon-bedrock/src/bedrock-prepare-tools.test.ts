import { prepareTools } from './bedrock-prepare-tools';

vi.mock('./tool/web-search_20250305', () => ({
  webSearch_20250305ArgsSchema: {
    parse: (args: any) => args,
  },
}));

describe('prepareTools for Amazon Bedrock', () => {
  describe('Anthropic Provider-Defined Tools', () => {
    it('should correctly prepare a single Anthropic computer tool with all args', () => {
      const result = prepareTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'anthropic.computer_20241022',
            name: 'computer',
            args: {
              displayWidthPx: 1920,
              displayHeightPx: 1080,
              displayNumber: 1,
            },
          },
        ],
      });

      expect(result.toolConfig.tools).toBeUndefined();
      expect(result.anthropicTools).toEqual([
        {
          name: 'computer',
          type: 'computer_20241022',
          display_width_px: 1920,
          display_height_px: 1080,
          display_number: 1,
        },
      ]);
      expect(result.betas).toEqual(new Set(['computer-use-2024-10-22']));
      expect(result.toolWarnings).toEqual([]);
    });

    it('should correctly prepare the bash tool', () => {
      const result = prepareTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'anthropic.bash_20241022',
            name: 'bash',
            args: {},
          },
        ],
      });

      expect(result.toolConfig.tools).toBeUndefined();
      expect(result.anthropicTools).toEqual([
        {
          name: 'bash',
          type: 'bash_20241022',
        },
      ]);
      expect(result.betas).toEqual(new Set(['computer-use-2024-10-22']));
      expect(result.toolWarnings).toEqual([]);
    });

    it('should handle a mix of standard function tools and Anthropic tools', () => {
      const result = prepareTools({
        tools: [
          {
            type: 'function',
            name: 'get_weather',
            description: 'Get the weather for a location',
            inputSchema: { type: 'object', properties: {} },
          },
          {
            type: 'provider-defined',
            id: 'anthropic.text_editor_20241022',
            name: 'str_replace_editor',
            args: {},
          },
        ],
      });

      expect(result.toolConfig.tools).toHaveLength(1);
      expect(result.toolConfig.tools).toContainEqual({
        toolSpec: {
          name: 'get_weather',
          description: 'Get the weather for a location',
          inputSchema: { json: { type: 'object', properties: {} } },
        },
      });
      expect(result.anthropicTools).toHaveLength(1);
      expect(result.anthropicTools).toContainEqual({
        name: 'str_replace_editor',
        type: 'text_editor_20241022',
      });
      expect(result.betas).toEqual(new Set(['computer-use-2024-10-22']));
      expect(result.toolWarnings).toEqual([]);
    });

    it('should collect beta flags from multiple different Anthropic tools', () => {
      const result = prepareTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'anthropic.computer_20241022',
            name: 'computer',
            args: {},
          },
          {
            type: 'provider-defined',
            id: 'anthropic.bash_20250124',
            name: 'bash',
            args: {},
          },
        ],
      });

      expect(result.betas).toEqual(
        new Set(['computer-use-2024-10-22', 'computer-use-2025-01-24']),
      );
    });

    it('should correctly prepare the web search tool', () => {
      const result = prepareTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'anthropic.web_search_20250305',
            name: 'web_search',
            args: {
              maxUses: 5,
              allowedDomains: ['example.com'],
            },
          },
        ],
      });

      expect(result.toolConfig.tools).toBeUndefined();
      expect(result.anthropicTools).toEqual([
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 5,
          allowed_domains: ['example.com'],
          blocked_domains: undefined,
          user_location: undefined,
        },
      ]);
      expect(result.betas).toEqual(new Set()); // No beta flag for web search
      expect(result.toolWarnings).toEqual([]);
    });
  });
});
