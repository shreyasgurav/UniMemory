/**
 * Add Source Tool
 * Saves a full document/chat as a source with automatic title, summary, and memory extraction
 */

import { UniMemoryClient } from '../client/unimemory.js';

export interface AddSourceInput {
  raw_content: string | Record<string, any>;
  type?: 'chat' | 'document' | 'text';
  metadata?: Record<string, any>;
  project_id?: string;
}

export const addSourceTool = {
  name: 'add_source',
  description:
    'Save a full document, chat, or conversation as a source. The system will automatically generate a title, summary, and extract nuclear memories from the content. Use this for saving entire conversations, documents, or any substantial content.',
  inputSchema: {
    type: 'object',
    properties: {
      raw_content: {
        type: ['string', 'object'],
        description:
          'The full content to save. Can be a string (for text/documents) or an object with messages array (for chats).',
      },
      type: {
        type: 'string',
        enum: ['chat', 'document', 'text'],
        description: 'Type of source. Defaults to "chat" if raw_content has messages, otherwise "text".',
      },
      metadata: {
        type: 'object',
        description: 'Optional metadata like tags, context, or custom fields.',
      },
      project_id: {
        type: 'string',
        description: 'Optional project ID to save this source to. Use get_projects to find project IDs.',
      },
    },
    required: ['raw_content'],
  },
};

export async function executeAddSource(
  client: UniMemoryClient,
  input: AddSourceInput
): Promise<any> {
  // Determine type if not provided
  let type = input.type;
  if (!type) {
    if (typeof input.raw_content === 'object' && 'messages' in input.raw_content) {
      type = 'chat';
    } else {
      type = 'text';
    }
  }

  // Call the ingest API endpoint based on type
  const endpoint = type === 'chat' ? '/v1/ingest/chat' : '/v1/ingest/text';
  
  const payload: any = {
    raw_content: input.raw_content,
  };

  if (input.metadata) {
    payload.metadata = input.metadata;
  }

  if (input.project_id) {
    payload.project_id = input.project_id;
  }

  const result = await client.ingestSource(endpoint, payload);

  return {
    success: true,
    source_id: result.source_id,
    title: result.title,
    summary: result.summary,
    memories_extracted: result.memories_count || 0,
    message: 'Source saved successfully. Title, summary, and memories were automatically generated.',
  };
}
