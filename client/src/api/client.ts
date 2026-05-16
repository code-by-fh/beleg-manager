const BASE_URL = import.meta.env.VITE_API_URL ?? "";

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE_URL + input, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T,>(url: string) => request<T>(url),
  post: <T,>(url: string, body?: unknown) =>
    request<T>(url, { method: "POST", body: body == null ? undefined : JSON.stringify(body) }),
  put: <T,>(url: string, body?: unknown) =>
    request<T>(url, { method: "PUT", body: body == null ? undefined : JSON.stringify(body) }),
  patch: <T,>(url: string, body?: unknown) =>
    request<T>(url, { method: "PATCH", body: body == null ? undefined : JSON.stringify(body) }),
  delete: <T,>(url: string) => request<T>(url, { method: "DELETE" }),
  postForm: async <T,>(url: string, form: FormData): Promise<T> => {
    const res = await fetch(BASE_URL + url, { method: "POST", credentials: "include", body: form });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${res.status} ${res.statusText}: ${body}`);
    }
    return (await res.json()) as T;
  },
};
