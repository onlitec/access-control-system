import { expect, test } from '@playwright/test';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'security.test@local';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'ChangeMe123!';
const API_BASE = process.env.E2E_API_BASE || 'https://localhost:8443/api';

async function loginApi(request: any) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await request.post(`${API_BASE}/auth/login`, {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    if (response.status() === 429) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      continue;
    }
    expect(response.ok()).toBeTruthy();
    return response.json();
  }
  throw new Error('Unable to login due to repeated rate limiting');
}

test('security API contract: sort, export meta and metrics', async ({ request }) => {
  const auth = await loginApi(request);
  const token = auth.token as string;
  const headers = { Authorization: `Bearer ${token}` };

  const sorted = await request.get(`${API_BASE}/security/session-audit?page=1&limit=10&sortBy=eventType&sortOrder=asc`, { headers });
  expect(sorted.ok()).toBeTruthy();
  const sortedBody = await sorted.json();
  expect(sortedBody.sortBy).toBe('eventType');
  expect(sortedBody.sortOrder).toBe('asc');
  expect(Array.isArray(sortedBody.data)).toBeTruthy();

  const badSort = await request.get(`${API_BASE}/security/session-audit?sortBy=invalid_column`, { headers });
  expect(badSort.status()).toBe(400);

  const exportMeta = await request.get(`${API_BASE}/security/session-audit/export/meta?limit=25000`, { headers });
  expect(exportMeta.ok()).toBeTruthy();
  const exportMetaBody = await exportMeta.json();
  expect(typeof exportMetaBody.maxLimit).toBe('number');
  expect(exportMetaBody.effectiveLimit).toBeLessThanOrEqual(exportMetaBody.maxLimit);

  const metrics = await request.get(`${API_BASE}/security/metrics?windowHours=24&topN=5`, { headers });
  expect(metrics.ok()).toBeTruthy();
  const metricsBody = await metrics.json();
  expect(typeof metricsBody.login.attempts).toBe('number');
  expect(typeof metricsBody.login.failedAttempts).toBe('number');
  expect(typeof metricsBody.login.failureRate).toBe('number');
  expect(Array.isArray(metricsBody.topIpAttempts)).toBeTruthy();
  expect(Array.isArray(metricsBody.topUserAttempts)).toBeTruthy();

  const metricsHistory = await request.get(`${API_BASE}/security/metrics/history?windowHours=24&limit=10`, { headers });
  expect(metricsHistory.ok()).toBeTruthy();
  const metricsHistoryBody = await metricsHistory.json();
  expect(typeof metricsHistoryBody.count).toBe('number');
  expect(Array.isArray(metricsHistoryBody.data)).toBeTruthy();
});
