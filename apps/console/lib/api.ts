const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://unimemory.up.railway.app/api/v1";

export interface APIKey {
  id: string;
  key?: string;
  key_prefix: string;
  name: string;
  user_id: string;
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

export interface Memory {
  id: string;
  user_id: string;
  api_key_id?: string;
  content: string;
  sector?: string;
  salience: number;
  tags: string[];
  created_at: string;
}

export interface MemoryListResponse {
  memories: Memory[];
  total: number;
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

// API Keys - now work directly with users (no projects)
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

// Memories
export const listMemories = async (
  token: string,
  options: { limit?: number; offset?: number; sector?: string; api_key_id?: string } = {}
) => {
  const query = new URLSearchParams();
  if (options.limit) query.append("limit", options.limit.toString());
  if (options.offset) query.append("offset", options.offset.toString());
  if (options.sector) query.append("sector", options.sector);
  if (options.api_key_id) query.append("api_key_id", options.api_key_id);

  const queryString = query.toString();
  return request<MemoryListResponse>(`/memories/me${queryString ? `?${queryString}` : ""}`, { token });
};

export const deleteMemory = async (token: string, memoryId: string) => {
  return request<void>(`/memories/me/${memoryId}`, {
    method: "DELETE",
    token,
  });
};

export const updateMemory = async (
  token: string,
  memoryId: string,
  updates: { content?: string; salience?: number; tags?: string[] }
) => {
  return request<Memory>(`/memories/me/${memoryId}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(updates),
  });
};

// Dashboard Stats
export interface DashboardStats {
  total_memories: number;
  total_sources: number;
  total_end_users: number;
  requests_24h: number;
  requests_7d: number;
  tokens_used_30d: number;
}

export interface MemoriesOverTime {
  day: string;
  count: number;
}

export interface RequestsOverTime {
  day: string;
  count: number;
}

export interface EndUserStats {
  id: string;
  external_user_id: string;
  memory_count: number;
  created_at: string;
}

export interface SourceStats {
  type: string;
  count: number;
}

export const getDashboardStats = async (token: string) => {
  return request<DashboardStats>("/stats/overview", { token });
};

export const getMemoriesOverTime = async (token: string, days: number = 30) => {
  return request<MemoriesOverTime[]>(`/stats/memories-over-time?days=${days}`, { token });
};

export const getRequestsOverTime = async (token: string, days: number = 30) => {
  return request<RequestsOverTime[]>(`/stats/requests-over-time?days=${days}`, { token });
};

export const getEndUsersStats = async (token: string, limit: number = 50) => {
  return request<EndUserStats[]>(`/stats/end-users?limit=${limit}`, { token });
};

export const getSourcesByType = async (token: string) => {
  return request<SourceStats[]>("/stats/sources-by-type", { token });
};

// Processing Logs
export interface ProcessingLog {
  id: string;
  processed_at: string;
  was_worth_remembering: boolean;
  reason: string | null;
  extracted_count: number;
  raw_content_hash: string | null;
}

export interface LogsCount {
  total: number;
}

export const getProcessingLogs = async (token: string, limit: number = 50, offset: number = 0) => {
  return request<ProcessingLog[]>(`/stats/logs?limit=${limit}&offset=${offset}`, { token });
};

export const getLogsCount = async (token: string) => {
  return request<LogsCount>("/stats/logs/count", { token });
};
