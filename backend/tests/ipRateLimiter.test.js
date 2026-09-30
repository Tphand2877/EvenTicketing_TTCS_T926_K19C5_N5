/**
 * SCRUM-72 [S-02 (T-09)] - Brute-force Protection by IP
 */

const express = require('express');
const request = require('supertest');
const { loginIpRateLimiter } = require('../src/middleware/ipRateLimiter');
const { IP_RATE_LIMIT } = require('../src/config/security');

function buildTestApp() {
  const app = express();
  app.post('/login', loginIpRateLimiter, (req, res) => {
    res.status(200).json({ success: true });
  });
  return app;
}

describe('IP rate limiter cho /login (T-09)', () => {
  test(`Cho phép tối đa ${IP_RATE_LIMIT.MAX_ATTEMPTS} request từ 1 IP, request kế tiếp bị chặn (429)`, async () => {
    const app = buildTestApp();
    const agent = request.agent(app); // giữ cùng 1 "kết nối" -> cùng IP giả lập của supertest

    let lastRes;
    for (let i = 0; i < IP_RATE_LIMIT.MAX_ATTEMPTS; i += 1) {
      lastRes = await agent.post('/login');
      expect(lastRes.status).toBe(200);
    }

    // Request vượt ngưỡng -> bị chặn
    const blockedRes = await agent.post('/login');
    expect(blockedRes.status).toBe(429);
    expect(blockedRes.body.success).toBe(false);
  }, 20000);
});
