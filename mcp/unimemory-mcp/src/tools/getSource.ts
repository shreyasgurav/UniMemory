/**
 * get_source tool
 * Gets the full source document/chat for grounding
 */

import { UniMemoryClient } from '../client/unimemory.js';

export interface GetSourceInput {
  source_id: string;
}

export interface GetSourceOutput {
  id: string;
  type: string;
  title?: string;
  summary?: string;
  raw_content?: unknown;
  created_at: string;
  found: boolean;
}

export const getSourceTool = {
  name: 'get_source',
  description:
    'Get the full source document or conversation that a memory came from. Use this when you need the complete original content for accurate reasoning.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      source_id: {
        type: 'string',
        description: 'The source ID to retrieve',
      },
    },
    required: ['source_id'],
  },
};

export async function executeGetSource(
  client: UniMemoryClient,
  input: GetSourceInput
): Promise<GetSourceOutput> {
  const { source_id } = input;

  const source = await client.getSource(source_id);

  if (!source) {
    return {
      id: source_id,
      type: 'unknown',
      found: false,
      created_at: '',
    };
  }

  return {
    id: source.id,
    type: source.type,
    title: source.title,
    summary: source.summary,
    raw_content: source.raw_content,
    created_at: source.created_at,
    found: true,
  };
}
