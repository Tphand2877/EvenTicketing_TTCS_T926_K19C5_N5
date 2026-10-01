const request = require("supertest");
const app = require("../src/app");

describe("GET /health", () => {
  test("should return 200 and status ok", async () => {
    const response = await request(app).get("/health");

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(response.body).toHaveProperty("timestamp");
  });
});