export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public issues?: import('../shared/model').ValidationIssue[],
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  body?: unknown,
  method = 'POST',
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? 'GET' : method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(data.message || 'Не удалось выполнить запрос', response.status, data.issues);
  return data as T;
}
