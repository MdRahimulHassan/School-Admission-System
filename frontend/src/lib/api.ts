import { getApiBaseUrl } from './config';

export type HoldStatus = 'HELD' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED';

export interface ClassInfo {
  id: string;
  name: string;
  totalSeats: number;
  heldSeats: number;
  confirmedSeats: number;
  availableSeats: number;
}

export interface Hold {
  holdId: string;
  classId: string;
  className?: string;
  studentId?: string;
  status: HoldStatus;
  expiresAt: string;
  /**
   * When the hold runs out, as a timestamp on THIS device's clock. Worked out from the server's
   * "remainingSeconds" so the countdown is right even if the device clock is wrong.
   */
  deadline: number;
}

/**
 * Every failure the UI has to explain. `code` is the backend's machine code
 * (e.g. NO_SEATS_AVAILABLE) or NETWORK_ERROR when the server could not be reached at all.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'ApiError';
  }

  get isNetworkError(): boolean {
    return this.code === 'NETWORK_ERROR' || this.code === 'SERVICE_UNAVAILABLE';
  }
}

export function toApiError(error: unknown): ApiError {
  return error instanceof ApiError ? error : new ApiError(0, 'UNKNOWN');
}

const REQUEST_TIMEOUT_MS = 10_000;

interface RequestOptions {
  studentId?: string;
  body?: unknown;
}

async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.studentId) headers['X-Student-Id'] = options.studentId;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch {
    // Server down, no internet, blocked by the browser, or timed out.
    throw new ApiError(0, 'NETWORK_ERROR');
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Not JSON (for example an error page from a proxy). Handled below.
  }

  if (!response.ok) {
    const error = payload as { error?: unknown; message?: unknown } | null;
    const code = typeof error?.error === 'string' ? error.error : response.status >= 500 ? 'SERVICE_UNAVAILABLE' : 'UNKNOWN';
    throw new ApiError(response.status, code, typeof error?.message === 'string' ? error.message : undefined);
  }
  if (payload === null) {
    throw new ApiError(response.status, 'UNKNOWN');
  }

  return payload as T;
}

type RawHold = Omit<Hold, 'deadline'> & { remainingSeconds?: number };

function toHold(raw: RawHold): Hold {
  const { remainingSeconds, ...rest } = raw;
  const deadline =
    typeof remainingSeconds === 'number' ? Date.now() + remainingSeconds * 1000 : Date.parse(raw.expiresAt);
  return { ...rest, deadline };
}

export const api = {
  listClasses: () => request<ClassInfo[]>('GET', '/classes'),

  createClass: (name: string, totalSeats: number) =>
    request<ClassInfo>('POST', '/classes', { body: { name, totalSeats } }),

  apply: async (classId: string, studentId: string) =>
    toHold(await request<RawHold>('POST', `/classes/${encodeURIComponent(classId)}/holds`, { studentId })),

  getHold: async (holdId: string) => toHold(await request<RawHold>('GET', `/holds/${encodeURIComponent(holdId)}`)),

  confirm: async (holdId: string, studentId: string) =>
    toHold(await request<RawHold>('POST', `/holds/${encodeURIComponent(holdId)}/confirm`, { studentId })),

  cancel: (holdId: string, studentId: string) =>
    request<void>('DELETE', `/holds/${encodeURIComponent(holdId)}`, { studentId }),

  myHolds: async (studentId: string) => (await request<RawHold[]>('GET', '/me/holds', { studentId })).map(toHold),
};
