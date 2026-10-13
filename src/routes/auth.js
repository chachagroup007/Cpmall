const crypto = require("node:crypto");
const { promisify } = require("node:util");
const nodemailer = require("nodemailer");
const QRCode = require("qrcode");
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

async function hashOtp(otp, salt) {
  const derived = await scrypt(otp, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return derived.toString("hex");
}


const TOTP_ISSUER = "Chacha Prime Marketplace";

function base32Encode(buffer) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const output = [];
  for (const char of input.replace(/=+$/g, "").toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("Invalid Base32 secret.");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function encryptionKey() {
  const key = process.env.TOTP_ENCRYPTION_KEY || "";
  if (!/^[a-fA-F0-9]{64}$/.test(key)) {
    throw new Error("TOTP_ENCRYPTION_KEY must be a 32-byte hex value.");
  }
  return Buffer.from(key, "hex");
}

function encryptTotpSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
}

function decryptTotpSecret(payload) {
  const bytes = Buffer.from(payload);
  const iv = bytes.subarray(0, 12);
  const tag = bytes.subarray(12, 28);
  const encrypted = bytes.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

function totpCode(secret, timeStep = Math.floor(Date.now() / 1000 / 30)) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(timeStep));
  const digest = crypto.createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1000000).padStart(6, "0");
}

function verifyTotp(secret, suppliedCode) {
  if (!/^\\d{6}$/.test(suppliedCode)) return false;
  const currentStep = Math.floor(Date.now() / 1000 / 30);
  for (let offset = -1; offset <= 1; offset += 1) {
    const expected = Buffer.from(totpCode(secret, currentStep + offset));
    const supplied = Buffer.from(suppliedCode);
    if (crypto.timingSafeEqual(expected, supplied)) return true;
  }
  return false;
}

async function findRegistrationUser(publicId) {
  if (typeof publicId !== "string" || publicId.length > 36) return null;
  const [users] = await getPool().execute(
    "SELECT id, email, email_verified_at, account_status FROM users WHERE public_id = ? LIMIT 1",
    [publicId]
  );
  return users[0] || null;
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
    const otpHash = salt + ":" + await hashOtp(otp, salt);
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
    const suppliedHash = await hashOtp(otp, salt || "");
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


router.post("/registration/authenticator/setup", async (req, res) => {
  const publicId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
  try {
    const user = await findRegistrationUser(publicId);
    if (!user || !user.email_verified_at || user.account_status !== "pending") {
      return res.status(404).json({ ok: false, message: "Verified registration session was not found. Verify your email first." });
    }
    const [securityRows] = await getPool().execute(
      "SELECT totp_secret_encrypted, totp_enabled_at FROM user_security WHERE user_id = ? LIMIT 1",
      [user.id]
    );
    if (!securityRows.length) {
      return res.status(409).json({ ok: false, message: "Security profile is missing. Contact support." });
    }
    if (securityRows[0].totp_enabled_at) {
      return res.status(409).json({ ok: false, message: "Authenticator verification is already enabled for this account." });
    }

    let secret;
    if (securityRows[0].totp_secret_encrypted) {
      secret = decryptTotpSecret(securityRows[0].totp_secret_encrypted);
    } else {
      secret = base32Encode(crypto.randomBytes(20));
      const encrypted = encryptTotpSecret(secret);
      await getPool().execute(
        "UPDATE user_security SET totp_secret_encrypted = ? WHERE user_id = ? AND totp_enabled_at IS NULL",
        [encrypted, user.id]
      );
    }
    const label = encodeURIComponent(user.email);
    const issuer = encodeURIComponent(TOTP_ISSUER);
    const otpauthUrl = "otpauth://totp/" + issuer + ":" + label +
      "?secret=" + secret + "&issuer=" + issuer + "&algorithm=SHA1&digits=6&period=30";
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { errorCorrectionLevel: "H", margin: 2, width: 280 });
    return res.json({
      ok: true,
      message: "Scan this QR code with Google Authenticator, then enter the six-digit code shown in the app.",
      qrDataUrl,
      manualKey: secret,
      accountLabel: user.email,
      issuer: TOTP_ISSUER
    });
  } catch (error) {
    console.error("Authenticator setup failed:", error.message);
    return res.status(503).json({
      ok: false,
      message: "Could not prepare authenticator setup. Check server configuration and try again."
    });
  }
});

router.post("/registration/authenticator/verify", async (req, res) => {
  const publicId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
  const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
  if (!/^\\d{6}$/.test(code)) {
    return res.status(400).json({ ok: false, message: "Enter the six-digit code from Google Authenticator." });
  }
  let connection;
  try {
    connection = await getPool().getConnection();
    await connection.beginTransaction();
    const [users] = await connection.execute(
      "SELECT id, email_verified_at, account_status FROM users WHERE public_id = ? LIMIT 1 FOR UPDATE",
      [publicId]
    );
    if (!users.length || !users[0].email_verified_at || users[0].account_status !== "pending") {
      await connection.rollback();
      return res.status(404).json({ ok: false, message: "Verified registration session was not found." });
    }
    const user = users[0];
    const [securityRows] = await connection.execute(
      "SELECT totp_secret_encrypted, totp_enabled_at FROM user_security WHERE user_id = ? LIMIT 1 FOR UPDATE",
      [user.id]
    );
    if (!securityRows.length || !securityRows[0].totp_secret_encrypted) {
      await connection.rollback();
      return res.status(400).json({ ok: false, message: "Start authenticator setup first." });
    }
    if (securityRows[0].totp_enabled_at) {
      await connection.rollback();
      return res.status(409).json({ ok: false, message: "Authenticator is already verified." });
    }
    const secret = decryptTotpSecret(securityRows[0].totp_secret_encrypted);
    if (!verifyTotp(secret, code)) {
      await connection.rollback();
      return res.status(400).json({ ok: false, message: "That authenticator code is incorrect or expired. Try the latest code." });
    }
    await connection.execute(
      "UPDATE user_security SET totp_enabled_at = UTC_TIMESTAMP() WHERE user_id = ?",
      [user.id]
    );
    await connection.commit();
    return res.json({
      ok: true,
      message: "Google Authenticator verified. Continue to personal information.",
      userId: publicId,
      nextStep: "personal_information"
    });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
    }
    console.error("Authenticator verification failed:", error.message);
    return res.status(503).json({ ok: false, message: "Could not verify authenticator right now. Try again later." });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
