// Dedicated automated tests for the Forgot Password & Reset Password flow
const test = require('node:test');
const assert = require('node:assert');

const BASE = process.env.BASE_URL || 'http://localhost:3000';

async function call(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

test('Forgot & Reset Password test suite', async (t) => {
  const email = 'priya@example.com';
  const originalPass = 'Pass@123';
  const newPass = 'ResetSecret@456';

  await t.test('1. Invalid email format is rejected (400)', async () => {
    const res = await call('POST', '/api/auth/forgot-password', { body: { email: 'invalid-email' } });
    assert.equal(res.status, 400);
    assert.match(res.data.error, /email/i);
  });

  await t.test('2. Nonexistent email returns generic success (prevent enumeration)', async () => {
    const res = await call('POST', '/api/auth/forgot-password', { body: { email: 'nobody_here@domain.test' } });
    assert.equal(res.status, 200);
    assert.match(res.data.message, /instructions have been generated/i);
  });

  await t.test('3. Existing email returns identical generic message', async () => {
    const res = await call('POST', '/api/auth/forgot-password', { body: { email } });
    assert.equal(res.status, 200);
    assert.match(res.data.message, /instructions have been generated/i);
  });

  await t.test('4. Reset password with malformed / invalid token is rejected', async () => {
    const res = await call('POST', '/api/auth/reset-password', { body: { token: 'invalid_token_12345', newPassword: 'ValidPassword123' } });
    assert.equal(res.status, 400);
    assert.match(res.data.error, /Invalid or expired/i);
  });

  await t.test('5. Reset password with short / weak password is rejected', async () => {
    const res = await call('POST', '/api/auth/reset-password', { body: { token: 'a'.repeat(64), newPassword: '123' } });
    assert.equal(res.status, 400);
    assert.match(res.data.error, /password must be 6-100 characters/i);
  });
});

