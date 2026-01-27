/**
 * Add Memory Tool
 * Saves an atomic fact or preference directly as a memory
 */

import { UniMemoryClient } from '../client/unimemory.js';

export interface AddMemoryInput {
  content: string;
  category?: string;
  user_id?: string;
}

export const addMemoryTool = {
  name: 'add_memory',
  description:
    'Save a single atomic fact, preference, or piece of information as a memory. Use this for explicit facts like "User prefers FastAPI", "Birthday is Aug 12", or "Uses dark mode". For full conversations or documents, use add_source instead.',
  inputSchema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'The fact or information to remember. Should be a single, clear statement.',
      },
      category: {
        type: 'string',
        description: 'Optional category like "preference", "fact", "decision", or "personal".',
      },
      user_id: {
        type: 'string',
        description: 'Optional user ID to scope this memory to a specific user.',
      },
    },
    required: ['content'],
  },
};

export async function executeAddMemory(
  client: UniMemoryClient,
  input: AddMemoryInput
): Promise<any> {
  const result = await client.saveMemory(input.content, {
    category: input.category,
    user_id: input.user_id,
  });

  return {
    success: true,
    memory_id: result.id,
    content: result.content,
    category: result.category,
    message: 'Memory saved successfully.',
  };
}
