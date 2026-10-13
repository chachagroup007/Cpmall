const crypto = require("node:crypto");
const { promisify } = require("node:util");
const nodemailer = require("nodemailer");
const express = require("express");
const { getPool } = require("../config/db");

const router = express.Router();
const scrypt = promisify(crypto.scrypt);
const OTP_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_OTP_PER_HOUR = 5;
const MAX_VERIFY_ATTEMPTS = 5;

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function validEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hashOtp(otp, salt) {
  return crypto.createHash("sha256").update(salt + ":" + otp).digest("hex");
}

function getMailer() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!user || !pass) {
    throw new Error("SMTP credentials are not configured.");
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.hostinger.com",
    port: Number(process.env.SMTP_PORT || 465),
    secure: (process.env.SMTP_SECURE || "true").toLowerCase() === "true",
    auth: { user, pass }
  });
}

router.post("/registration/send-otp", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!validEmail(email)) {
    return res.status(400).json({ ok: false, message: "Enter a valid email address." });
  }

  let connection;
  let otpRecordId;
  try {
    const pool = getPool();
    const [existingUsers] = await pool.execute(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [email]
    );
    if (existingUsers.length) {
      return res.status(409).json({
        ok: false,
        message: "An account already exists for this email. Please sign in instead."
      });
    }

    const [recent] = await pool.execute(
      "SELECT created_at FROM email_otps WHERE email = ? AND purpose = 'registration' AND consumed_at IS NULL ORDER BY id DESC LIMIT 1",
      [email]
    );
    if (recent.length) {
      const ageSeconds = (Date.now() - new Date(recent[0].created_at).getTime()) / 1000;
      if (ageSeconds < RESEND_COOLDOWN_SECONDS) {
        return res.status(429).json({
          ok: false,
          message: "Please wait before requesting another verification code.",
          retryAfterSeconds: Math.ceil(RESEND_COOLDOWN_SECONDS - ageSeconds)
        });
      }
    }

    const [hourly] = await pool.execute(
      "SELECT COUNT(*) AS total FROM email_otps WHERE email = ? AND purpose = 'registration' AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR)",
      [email]
    );
    if (Number(hourly[0].total) >= MAX_OTP_PER_HOUR) {
      return res.status(429).json({
        ok: false,
        message: "Too many verification requests. Try again in an hour."
      });
    }

    const otp = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    const salt = crypto.randomBytes(16).toString("hex");
    const otpHash = salt + ":" + hashOtp(otp, salt);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    const [insert] = await pool.execute(
      "INSERT INTO email_otps (user_id, email, purpose, otp_hash, expires_at) VALUES (NULL, ?, 'registration', ?, ?)",
      [email, otpHash, expiresAt]
    );
    otpRecordId = insert.insertId;

    const mailer = getMailer();
    await mailer.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: email,
      subject: "Your Chacha Prime verification code",
      text: "Your Chacha Prime Marketplace verification code is " + otp +
        ". It expires in " + OTP_TTL_MINUTES + " minutes. If you did not request this, ignore this email.",
      html: "<p>Your Chacha Prime Marketplace verification code is:</p><p style=\"font-size:28px;font-weight:bold;letter-spacing:6px\">" +
        otp + "</p><p>This code expires in " + OTP_TTL_MINUTES +
        " minutes. If you did not request it, ignore this email.</p>"
    });

    return res.status(200).json({
      ok: true,
      message: "Verification code sent. Check your email.",
      expiresInSeconds: OTP_TTL_MINUTES * 60
    });
  } catch (error) {
    if (otpRecordId) {
      try {
        await getPool().execute(
          "UPDATE email_otps SET consumed_at = UTC_TIMESTAMP() WHERE id = ?",
          [otpRecordId]
        );
      } catch (_) {}
    }
    console.error("Registration OTP delivery failed:", error.message);
    return res.status(503).json({
      ok: false,
      message: "Could not send the verification email. Check server email configuration and try again."
    });
  }
});

router.post("/registration/verify-otp", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const otp = typeof req.body?.otp === "string" ? req.body.otp.trim() : "";
  if (!validEmail(email) || !/^\d{6}$/.test(otp)) {
    return res.status(400).json({ ok: false, message: "Enter your email and the six-digit verification code." });
  }

  let connection;
  try {
    connection = await getPool().getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      "SELECT id, otp_hash, expires_at, attempt_count FROM email_otps WHERE email = ? AND purpose = 'registration' AND consumed_at IS NULL ORDER BY id DESC LIMIT 1 FOR UPDATE",
      [email]
    );
    if (!rows.length) {
      await connection.rollback();
      return res.status(400).json({ ok: false, message: "No active code was found. Request a new code." });
    }

    const record = rows[0];
    if (new Date(record.expires_at).getTime() <= Date.now()) {
      await connection.execute(
        "UPDATE email_otps SET consumed_at = UTC_TIMESTAMP() WHERE id = ?",
        [record.id]
      );
      await connection.commit();
      return res.status(400).json({ ok: false, message: "This code has expired. Request a new one." });
    }

    if (Number(record.attempt_count) >= MAX_VERIFY_ATTEMPTS) {
      await connection.execute(
        "UPDATE email_otps SET consumed_at = UTC_TIMESTAMP() WHERE id = ?",
        [record.id]
      );
      await connection.commit();
      return res.status(429).json({ ok: false, message: "Too many incorrect attempts. Request a new code." });
    }

    const [salt, expectedHash] = String(record.otp_hash).split(":");
    const suppliedHash = hashOtp(otp, salt || "");
    const expected = Buffer.from(expectedHash || "", "hex");
    const supplied = Buffer.from(suppliedHash, "hex");
    const matches = expected.length === supplied.length &&
      crypto.timingSafeEqual(expected, supplied);

    if (!matches) {
      await connection.execute(
        "UPDATE email_otps SET attempt_count = attempt_count + 1 WHERE id = ?",
        [record.id]
      );
      await connection.commit();
      return res.status(400).json({ ok: false, message: "The verification code is incorrect." });
    }

    const [existing] = await connection.execute(
      "SELECT id, email_verified_at, account_status FROM users WHERE email = ? LIMIT 1 FOR UPDATE",
      [email]
    );
    if (existing.length) {
      await connection.execute(
        "UPDATE email_otps SET consumed_at = UTC_TIMESTAMP() WHERE id = ?",
        [record.id]
      );
      await connection.commit();
      return res.status(409).json({ ok: false, message: "An account already exists for this email. Please sign in." });
    }

    const publicId = crypto.randomUUID();
    const [userInsert] = await connection.execute(
      "INSERT INTO users (public_id, email, email_verified_at, account_status) VALUES (?, ?, UTC_TIMESTAMP(), 'pending')",
      [publicId, email]
    );
    const userId = userInsert.insertId;

    await connection.execute(
      "INSERT INTO user_security (user_id) VALUES (?)",
      [userId]
    );
    await connection.execute(
      "UPDATE email_otps SET user_id = ?, consumed_at = UTC_TIMESTAMP() WHERE id = ?",
      [userId, record.id]
    );

    await connection.commit();
    return res.status(201).json({
      ok: true,
      message: "Email verified. Continue to the next registration step.",
      userId: publicId,
      nextStep: "authenticator_setup"
    });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
    }
    console.error("Registration OTP verification failed:", error.message);
    return res.status(503).json({
      ok: false,
      message: "Could not verify the code right now. Try again later."
    });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
