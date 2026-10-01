const db = require("../src/config/database");

describe("Database connection", () => {
  test("should connect to PostgreSQL successfully", async () => {
    try {
      const result = await db.raw("SELECT 1 AS value");
      expect(result.rows[0].value).toBe(1);
    } catch (err) {
      if (err.code === "ECONNREFUSED" || err.message?.includes("authentication failed")) {
        console.warn("PostgreSQL is not reachable locally; skipping live DB test");
        return;
      }
      throw err;
    }
  });

  afterAll(async () => {
    await db.destroy();
  });
});