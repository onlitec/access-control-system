import { expect, test } from '@playwright/test';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'security.test@local';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'ChangeMe123!';
const API_BASE = process.env.E2E_API_BASE || 'https://localhost:8443/api';

async function loginApi(request: any, email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await request.post(`${API_BASE}/auth/login`, {
      data: { email, password },
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

test('session audit flow: filters, presets, chips, sorting and export progress', async ({ page, request }) => {
  const auth = await loginApi(request);
  await request.post(`${API_BASE}/auth/logout`, {
    data: { refreshToken: auth.refreshToken },
  });

  await page.addInitScript(({ token, refreshToken, user }) => {
    localStorage.setItem('admin_token', token);
    localStorage.setItem('admin_refresh_token', refreshToken);
    localStorage.setItem('admin_user', JSON.stringify(user));
  }, {
    token: auth.token,
    refreshToken: auth.refreshToken,
    user: auth.user,
  });

  await page.goto('/admin/session-audit');
  if (page.url().includes('/admin/login')) {
    await page.locator('#email').fill(ADMIN_EMAIL);
    await page.locator('#password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.waitForURL(/\/admin/);
    await page.goto('/admin/session-audit');
  }
  await expect(page.getByTestId('session-audit-page')).toBeVisible();
  await expect(page.getByTestId('audit-table')).toBeVisible();
  await expect(page.getByTestId('metrics-history-table')).toBeVisible();

  const auditApi = await request.get(`${API_BASE}/security/session-audit?page=1&limit=30`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  expect(auditApi.ok()).toBeTruthy();
  const auditJson = await auditApi.json();
  const rowWithSession = (auditJson.data || []).find((row: any) => !!row.sessionId);
  const rowWithIp = (auditJson.data || []).find((row: any) => !!row.ipAddress);

  const sessionFilter = rowWithSession?.sessionId || 'session-e2e-filter';
  const ipFilter = rowWithIp?.ipAddress || '127.0.0.1';
  await page.getByPlaceholder('session-id').fill(sessionFilter);
  await page.getByPlaceholder('192.168.0.1').fill(ipFilter);
  const filterResponse = page.waitForResponse((res) =>
    res.url().includes('/security/session-audit?') &&
    res.url().includes('sessionId=') &&
    res.url().includes('ipAddress=') &&
    res.status() === 200,
  );
  await page.getByTestId('apply-filter-button').click();
  await filterResponse;
  await expect(page.getByTestId('active-filter-chips')).toContainText('Sessão:');
  await expect(page.getByTestId('active-filter-chips')).toContainText('IP:');
  await page.getByTestId('clear-filters').click();
  await expect(page.getByTestId('active-filter-chips')).toHaveCount(0);

  const preset12hResponse = page.waitForResponse((res) =>
    res.url().includes('/security/session-audit?') &&
    res.url().includes('startTime=') &&
    res.url().includes('endTime=') &&
    res.status() === 200,
  );
  await page.getByTestId('preset-12h').click();
  await preset12hResponse;
  await expect(page.getByTestId('active-filter-chips')).toContainText('De:');
  await expect(page.getByTestId('active-filter-chips')).toContainText('Até:');

  const preset30dResponse = page.waitForResponse((res) =>
    res.url().includes('/security/session-audit?') &&
    res.url().includes('startTime=') &&
    res.url().includes('endTime=') &&
    res.status() === 200,
  );
  await page.getByTestId('preset-30d').click();
  await preset30dResponse;
  await expect(page.getByTestId('active-filter-chips')).toContainText('De:');
  await expect(page.getByTestId('active-filter-chips')).toContainText('Até:');

  const preset1hResponse = page.waitForResponse((res) =>
    res.url().includes('/security/session-audit?') &&
    res.url().includes('startTime=') &&
    res.url().includes('endTime=') &&
    res.status() === 200,
  );
  await page.getByTestId('preset-1h').click();
  await preset1hResponse;
  await expect(page.getByTestId('active-filter-chips')).toBeVisible();

  const presetLoginFailuresResponse = page.waitForResponse((res) =>
    res.url().includes('/security/session-audit?') &&
    res.url().includes('eventType=login') &&
    res.url().includes('success=false') &&
    res.status() === 200,
  );
  await page.getByTestId('preset-login-failures').click();
  await presetLoginFailuresResponse;
  await expect(page.getByTestId('active-filter-chips')).toContainText('Evento: login');
  await expect(page.getByTestId('active-filter-chips')).toContainText('Sucesso: Não');

  const sortCreatedAtResponse = page.waitForResponse((res) =>
    res.url().includes('/security/session-audit?') &&
    res.url().includes('sortBy=createdAt') &&
    res.url().includes('sortOrder=asc') &&
    res.status() === 200,
  );
  await page.getByTestId('sort-createdAt').click();
  await sortCreatedAtResponse;
  await expect(page.getByTestId('sort-createdAt')).toContainText(/▲|▼/);

  const sortEventTypeResponse = page.waitForResponse((res) =>
    res.url().includes('/security/session-audit?') &&
    res.url().includes('sortBy=eventType') &&
    res.url().includes('sortOrder=asc') &&
    res.status() === 200,
  );
  await page.getByTestId('sort-eventType').click();
  await sortEventTypeResponse;
  await expect(page.getByTestId('sort-eventType')).toContainText(/▲|▼/);

  const sortSuccessResponse = page.waitForResponse((res) =>
    res.url().includes('/security/session-audit?') &&
    res.url().includes('sortBy=success') &&
    res.url().includes('sortOrder=asc') &&
    res.status() === 200,
  );
  await page.getByTestId('sort-success').click();
  await sortSuccessResponse;
  await expect(page.getByTestId('sort-success')).toContainText(/▲|▼/);

  await page.getByTestId('export-limit-input').fill('200');
  const exportResponse = page.waitForResponse((res) =>
    res.url().includes('/security/session-audit/export?') &&
    res.status() === 200,
  );
  await page.getByTestId('export-csv-button').click();
  await exportResponse;

  await expect(page.getByTestId('export-feedback')).toBeVisible();
  await expect(page.getByTestId('export-progress')).toBeVisible();
  const progressText = (await page.getByTestId('export-progress').textContent()) || '';
  expect(progressText.includes('%')).toBeTruthy();
});
