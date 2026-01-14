/**
 * get_memory_context tool
 * Gets full context for a specific memory including linked source
 */

import { UniMemoryClient } from '../client/unimemory.js';

export interface GetMemoryContextInput {
  memory_id: string;
}

export interface GetMemoryContextOutput {
  memory: string;
  memory_id: string;
  summary?: string;
  source_type?: string;
  source_id?: string;
  raw_excerpt?: string;
  created_at: string;
  found: boolean;
}

export const getMemoryContextTool = {
  name: 'get_memory_context',
  description:
    'Get detailed context for a specific memory, including its source summary and a preview of the raw content. Use this after search_memory to get more details about a specific memory.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      memory_id: {
        type: 'string',
        description: 'The memory ID to get context for',
      },
    },
    required: ['memory_id'],
  },
};

export async function executeGetMemoryContext(
  client: UniMemoryClient,
  input: GetMemoryContextInput
): Promise<GetMemoryContextOutput> {
  const { memory_id } = input;

  const context = await client.getMemoryContext(memory_id);

  if (!context) {
    return {
      memory: '',
      memory_id,
      found: false,
      created_at: '',
    };
  }

  return {
    memory: context.content,
    memory_id: context.memory_id,
    summary: context.summary,
    source_type: context.source_type,
    source_id: context.source_id,
    raw_excerpt: context.raw_excerpt,
    created_at: context.created_at,
    found: true,
  };
}
