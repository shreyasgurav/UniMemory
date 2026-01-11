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

export interface UserSettings {
  id: string;
  email: string;
  display_name: string;
  plan: string;
  avatar_url?: string;
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
    let errorDetail = `Request failed: ${response.status}`;
    try {
      const error = await response.json();
      // FastAPI validation errors can be an array or object
      if (Array.isArray(error.detail)) {
        // Pydantic validation errors
        const messages = error.detail.map((e: any) => 
          `${e.loc?.join('.')}: ${e.msg}`
        ).join(', ');
        errorDetail = messages || JSON.stringify(error);
      } else if (error.detail) {
        // Single error message
        errorDetail = typeof error.detail === 'string' ? error.detail : JSON.stringify(error.detail);
      } else if (error.message) {
        errorDetail = error.message;
      } else {
        errorDetail = JSON.stringify(error);
      }
    } catch (e) {
      // If JSON parsing fails, try to get text
      try {
        const text = await response.text();
        if (text) errorDetail = text;
      } catch (e2) {
        // Ignore if text parsing also fails
      }
    }
    const error = new Error(errorDetail);
    (error as any).status = response.status;
    throw error;
  }
  
  // Handle 204 No Content responses
  if (response.status === 204) {
    return {} as T;
  }
  
  // Check if response has content before parsing JSON
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    const text = await response.text();
    return text ? JSON.parse(text) : ({} as T);
  }
  
  return {} as T;
}

// Auth
export const getMe = async (token: string) => {
  return request<UserSettings>("/auth/me", { token });
};

// Projects - mostly internal, users don't see projects
export const getDefaultProject = async (token: string) => {
  return request<Project>("/projects/default", { token });
};

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

export const getProject = async (token: string, projectId: string) => {
  return request<Project>(`/projects/${projectId}`, { token });
};

export const updateProject = async (token: string, projectId: string, name: string, description?: string) => {
  return request<Project>(`/projects/${projectId}`, {
    method: "PATCH",
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

// API Keys - now work without requiring project_id (uses default project)
export const listAPIKeys = async (token: string) => {
  return request<APIKey[]>("/keys", { token });
};

export const createAPIKey = async (token: string, name: string) => {
  return request<APIKey & { key: string }>("/keys", {
    method: "POST",
    token,
    body: JSON.stringify({ name }),
  });
};

export const revokeAPIKey = async (token: string, keyId: string) => {
  return request<void>(`/keys/${keyId}`, {
    method: "DELETE",
    token,
  });
};

