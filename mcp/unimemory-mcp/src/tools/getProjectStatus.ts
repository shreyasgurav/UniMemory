import { UniMemoryClient } from '../client/unimemory.js';

export interface GetProjectStatusInput {
  project_id: string;
}

export const getProjectStatusTool = {
  name: 'get_project_status',
  description:
    'Get detailed status of a specific project including its current status, status note, memory count, source count, and recent memories. Use this to understand where a project currently stands.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project_id: {
        type: 'string',
        description: 'The project ID to get status for. Use get_projects to find project IDs.',
      },
    },
    required: ['project_id'],
  },
};

export async function executeGetProjectStatus(
  input: GetProjectStatusInput,
  client: UniMemoryClient
) {
  const result = await client.getProjectStatus(input.project_id);
  if (!result) {
    return { error: 'Project not found', found: false };
  }
  return result;
}
