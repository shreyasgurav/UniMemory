/**
 * search_memory tool
 * Searches UniMemory for relevant memories based on a query
 */

import { UniMemoryClient, SearchResult } from '../client/unimemory.js';

export interface SearchMemoryInput {
  query: string;
  limit?: number;
  user_id?: string;
}

export interface SearchMemoryOutput {
  results: Array<{
    memory_id: string;
    content: string;
    salience: number;
    source_id?: string;
  }>;
  count: number;
}

export const searchMemoryTool = {
  name: 'search_memory',
  description:
    'Search your memory for relevant information. Use this to find what you know about a topic, person, preference, or past conversation.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'What to search for in memory (natural language query)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (default: 10)',
      },
      user_id: {
        type: 'string',
        description: 'Optional user ID to scope the search',
      },
    },
    required: ['query'],
  },
};

export async function executeSearchMemory(
  client: UniMemoryClient,
  input: SearchMemoryInput
): Promise<SearchMemoryOutput> {
  const { query, limit = 10, user_id } = input;

  const results: SearchResult[] = await client.searchMemories(query, {
    limit,
    user_id,
  });

  return {
    results: results.map((r) => ({
      memory_id: r.memory_id,
      content: r.content,
      salience: r.salience,
      source_id: r.source_id,
    })),
    count: results.length,
  };
}
