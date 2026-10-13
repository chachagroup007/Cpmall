require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const path = require("node:path");
const { checkDatabase } = require("./config/db");

const app = express();
const port = Number(process.env.PORT || 3000);

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "CPMALL API",
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString()
  });
});

app.get("/api/health/database", async (_req, res) => {
  try {
    await checkDatabase();
    res.json({ ok: true, database: "connected" });
  } catch (error) {
    console.error("Database health check failed:", error.message);
    res.status(503).json({
      ok: false,
      database: "unavailable",
      message: "Check server database configuration."
    });
  }
});

app.get("/api/membership/tiers", async (_req, res) => {
  try {
    const { getPool } = require("./config/db");
    const [tiers] = await getPool().query(
      `SELECT tier_code, tier_name, sort_order, minimum_completed_orders,
              minimum_completed_spend, qualification_mode, benefits_json
       FROM membership_tiers
       WHERE is_active = 1
       ORDER BY sort_order ASC`
    );
    res.json({ ok: true, tiers });
  } catch (error) {
    console.error("Membership tier query failed:", error.message);
    res.status(503).json({
      ok: false,
      message: "Membership tiers are not available yet. Import the database schema and configure the database."
    });
  }
});

app.use("/assets", express.static(path.join(__dirname, "..", "public")));
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.use((req, res) => {
  res.status(404).json({ ok: false, message: "Route not found." });
});

app.use((error, _req, res, _next) => {
  console.error("Unhandled request error:", error.message);
  res.status(500).json({ ok: false, message: "An unexpected server error occurred." });
});

app.listen(port, () => {
  console.log(`CPMALL server listening on port ${port}`);
});
