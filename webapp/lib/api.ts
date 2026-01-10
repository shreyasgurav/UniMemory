const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://unimemory.up.railway.app/api/v1";

export interface Project {
  id: string;
  name: string;
  description?: string;
  is_active: boolean;
  created_at: string;
}

export interface APIKey {
  id: string;
  key?: string;
  key_prefix: string;
  name: string;
  project_id: string;
  is_active: boolean;
  expires_at?: string;
  last_used_at?: string;
  usage_count: number;
  created_at: string;
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, ...fetchOptions } = options;
  
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers,
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `Request failed: ${response.status}`);
  }
  
  return response.json();
}

// Auth
export const getMe = async (token: string) => {
  return request<{ id: string; email: string; display_name: string; plan: string; avatar_url?: string }>("/auth/me", { token });
};

// Projects
export const listProjects = async (token: string) => {
  return request<Project[]>("/projects", { token });
};

export const createProject = async (token: string, name: string, description?: string) => {
  return request<Project>("/projects", {
    method: "POST",
    token,
    body: JSON.stringify({ name, description }),
  });
};

export const deleteProject = async (token: string, projectId: string) => {
  return request<{ success: boolean }>(`/projects/${projectId}`, {
    method: "DELETE",
    token,
  });
};

// API Keys
export const listAPIKeys = async (token: string, projectId?: string) => {
  const url = projectId ? `/keys?project_id=${projectId}` : "/keys";
  return request<APIKey[]>(url, { token });
};

export const createAPIKey = async (
  token: string,
  projectId: string,
  name: string
) => {
  return request<APIKey & { key: string }>("/keys", {
    method: "POST",
    token,
    body: JSON.stringify({ name, project_id: projectId }),
  });
};

export const revokeAPIKey = async (token: string, keyId: string) => {
  return request<{ success: boolean }>(`/keys/${keyId}`, {
    method: "DELETE",
    token,
  });
};

