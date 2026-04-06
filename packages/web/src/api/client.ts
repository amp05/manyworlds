import type { DailyContent, AdjudicationRequest, AdjudicationResponse } from '@manyworlds/shared';

const API_BASE = '/api';

export async function fetchDailyContent(date?: string): Promise<DailyContent> {
  const params = date ? `?date=${date}` : '';
  const res = await fetch(`${API_BASE}/daily${params}`);
  if (!res.ok) throw new Error(`Failed to fetch daily content: ${res.status}`);
  return res.json();
}

export async function adjudicate(req: AdjudicationRequest): Promise<AdjudicationResponse> {
  const res = await fetch(`${API_BASE}/adjudicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`Adjudication failed: ${res.status}`);
  return res.json();
}
