export async function postContent<T>(url: string, payload: object): Promise<T> {
  const response = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(String(response.status));
  return response.json() as Promise<T>;
}
