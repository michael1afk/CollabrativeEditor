/**
 * Typed fetch wrapper.
 *
 * Every call sends `credentials: 'include'` so the httpOnly session cookie
 * travels with it. In dev the Vite proxy forwards /api to the server on 3001,
 * which keeps requests same-origin - so the cookie is sent without any CORS
 * setup at all.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(`${status} ${code}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  // Built conditionally rather than with undefined values: under
  // exactOptionalPropertyTypes, `body: undefined` is not the same as absent.
  const init: RequestInit = { method, credentials: 'include' };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }

  const response = await fetch(`/api${path}`, init);

  if (!response.ok) {
    throw new ApiError(response.status, await readErrorCode(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

async function readErrorCode(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === 'string' ? body.error : 'request_failed';
  } catch {
    return 'request_failed';
  }
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

// --- shapes mirroring the server's responses -----------------------------

export interface User {
  id: string;
  email: string;
  displayName: string;
  color: string;
  isGuest: boolean;
}

export type DocumentRole = 'owner' | 'editor' | 'viewer';

export interface DocumentSummary {
  id: string;
  title: string;
  ownerId: string;
  role: DocumentRole | null;
  createdAt: string;
  updatedAt: string;
}

export const authApi = {
  me: () => api.get<{ user: User }>('/auth/me'),
  login: (email: string, password: string) =>
    api.post<{ user: User }>('/auth/login', { email, password }),
  signup: (email: string, password: string, displayName?: string) =>
    api.post<{ user: User }>('/auth/signup', { email, password, displayName }),
  guest: () => api.post<{ user: User; token: string }>('/auth/guest'),
  logout: () => api.post<{ ok: true }>('/auth/logout'),
  /** Short-lived token for the Hocuspocus handshake; see auth/jwt.ts. */
  collabToken: () => api.get<{ token: string }>('/auth/collab-token'),
};

export const documentsApi = {
  list: () => api.get<{ documents: DocumentSummary[] }>('/documents'),
  create: (title?: string) =>
    api.post<{ document: DocumentSummary }>('/documents', { title }),
  get: (id: string) => api.get<{ document: DocumentSummary }>(`/documents/${id}`),
  rename: (id: string, title: string) =>
    api.patch<{ document: DocumentSummary }>(`/documents/${id}`, { title }),
  remove: (id: string) => api.delete<{ ok: true; id: string }>(`/documents/${id}`),
};
