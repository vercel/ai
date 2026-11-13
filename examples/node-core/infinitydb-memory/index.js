/**
 * InfinityDB Drop-in Memory Middleware for Vercel AI SDK.
 *
 * Enriches prompts and chat completions with sub-millisecond local memories,
 * user persona facts, and corporate policies before sending to model endpoints.
 */

"use strict";

const { InfinityDB } = require("infinitydb");

class InfinityDBVercelMemory {
  constructor(options = {}) {
    this.db = options.db || new InfinityDB();
    this.userId = options.userId || "default_user";
    this.limit = options.limit || 5;
  }

  /**
   * Save a dialogue exchange into persistent L0-L6 memory.
   */
  async saveContext(prompt, response, metadata = {}) {
    const text = `User: ${prompt}\nAssistant: ${response}`;
    return this.db.add(text, this.userId, metadata.sessionId || null, 0.9);
  }

  /**
   * Recall memories and construct enriched prompt for Vercel AI SDK.
   */
  async enrichPrompt(prompt) {
    const recallRes = this.db.recall(prompt, this.limit, this.userId);
    const facts = (recallRes.results || []).map((r) => r.fact);
    const persona = this.db.getPersona(this.userId);

    let contextBlock = "";
    if (facts.length > 0) {
      contextBlock += `Recalled User Facts:\n${facts.map((f) => `- ${f}`).join("\n")}\n\n`;
    }
    if (Object.keys(persona).length > 0) {
      contextBlock += `User Persona:\n${Object.entries(persona).map(([k, v]) => `- ${k}: ${v}`).join("\n")}\n\n`;
    }

    if (!contextBlock) {
      return prompt;
    }

    return `${contextBlock}Current User Request: ${prompt}`;
  }

  /**
   * Vercel AI SDK transform middleware adapter.
   */
  createMiddleware() {
    return {
      wrapGenerate: async ({ doGenerate, params }) => {
        const originalPrompt = params.prompt || "";
        const enrichedPrompt = await this.enrichPrompt(originalPrompt);
        params.prompt = enrichedPrompt;

        const result = await doGenerate();
        if (result.text) {
          await this.saveContext(originalPrompt, result.text);
        }
        return result;
      },
    };
  }
}

module.exports = { InfinityDBVercelMemory };
