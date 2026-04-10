import type { DailyContent } from '@manyworlds/shared';

const API_BASE = '/api';

export async function fetchDailyContent(date?: string): Promise<DailyContent> {
  const params = date ? `?date=${date}` : '';
  const res = await fetch(`${API_BASE}/daily${params}`);
  if (!res.ok) throw new Error(`Failed to fetch daily content: ${res.status}`);
  return res.json();
}
