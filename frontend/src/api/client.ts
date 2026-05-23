// Tiny fetch wrapper. Always sends credentials so the auth cookie rides along.

export class ApiError extends Error {
  status: number;
  payload: any;
  constructor(status: number, payload: any) {
    super(typeof payload?.error === 'string' ? payload.error : `API error ${status}`);
    this.status = status;
    this.payload = payload;
  }
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    ...init,
  });
  const text = await res.text();
  let json: any = null;
  if (text) {
    try { json = JSON.parse(text); } catch { json = text; }
  }
  if (!res.ok) throw new ApiError(res.status, json);
  return json as T;
}
