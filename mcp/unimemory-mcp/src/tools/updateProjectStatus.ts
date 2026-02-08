import { UniMemoryClient } from '../client/unimemory.js';

export interface UpdateProjectStatusInput {
  project_id: string;
  status?: 'active' | 'paused' | 'completed' | 'archived';
  status_note?: string;
}

export const updateProjectStatusTool = {
  name: 'update_project_status',
  description:
    'Update the status and status note of a project. Use this to log progress like "Working on auth flow", "Deployed v2", "Waiting for API review", etc. Status can be: active, paused, completed, archived.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project_id: {
        type: 'string',
        description: 'The project ID to update. Use get_projects to find project IDs.',
      },
      status: {
        type: 'string',
        enum: ['active', 'paused', 'completed', 'archived'],
        description: 'Project status (active, paused, completed, archived)',
      },
      status_note: {
        type: 'string',
        description:
          'Free-text note about current project state, e.g. "Working on auth implementation", "Deployed to staging"',
      },
    },
    required: ['project_id'],
  },
};

export async function executeUpdateProjectStatus(
  input: UpdateProjectStatusInput,
  client: UniMemoryClient
) {
  const result = await client.updateProjectStatus(input.project_id, {
    status: input.status,
    status_note: input.status_note,
  });
  if (!result) {
    return { error: 'Project not found or update failed', success: false };
  }
  return result;
}
