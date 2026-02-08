import { UniMemoryClient } from '../client/unimemory.js';

export const getProjectsTool = {
  name: 'get_projects',
  description:
    'List all projects in UniMemory. Returns project names, IDs, status, memory/source counts. Use this to find a project_id before searching or saving memories to a specific project.',
  inputSchema: {
    type: 'object' as const,
    properties: {},
    required: [] as string[],
  },
};

export async function executeGetProjects(
  _input: Record<string, never>,
  client: UniMemoryClient
) {
  const projects = await client.getProjects();
  return {
    projects,
    count: projects.length,
  };
}
