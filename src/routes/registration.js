const express = require("express");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const multer = require("multer");
const { getPool } = require("../config/db");
const { generateUniqueCustomerNumber } = require("../services/customer-number");

const router = express.Router();

function clean(value, maxLength = 255) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

router.post("/personal-information", async (req, res) => {
  const publicId = clean(req.body?.userId, 36);
  const firstName = clean(req.body?.firstName, 100);
  const lastName = clean(req.body?.lastName, 100) || null;
  const fatherOrHusbandName = clean(req.body?.fatherOrHusbandName, 150);
  const dateOfBirth = clean(req.body?.dateOfBirth, 10);
  const phoneCountryCode = clean(req.body?.phoneCountryCode, 8);
  const phoneNumber = clean(req.body?.phoneNumber, 30);
  const addressLine1 = clean(req.body?.addressLine1, 255);
  const addressLine2 = clean(req.body?.addressLine2, 255) || null;
  const province = clean(req.body?.province, 120) || null;
  const city = clean(req.body?.city, 120);
  const postalCode = clean(req.body?.postalCode, 30) || null;
  const countryCode = clean(req.body?.countryCode, 2).toUpperCase();

  if (!publicId || !firstName || !fatherOrHusbandName || !validDate(dateOfBirth) ||
      !phoneCountryCode || !phoneNumber || !addressLine1 || !city ||
      !/^[A-Z]{2}$/.test(countryCode)) {
    return res.status(400).json({
      ok: false,
      message: "Complete all required fields and check the date and two-letter country code."
    });
  }
  if (!/^[+0-9() .-]{5,30}$/.test(phoneNumber) ||
      !/^\+?[0-9]{1,7}$/.test(phoneCountryCode)) {
    return res.status(400).json({ ok: false, message: "Enter a valid phone number and country calling code." });
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
      return res.status(404).json({ ok: false, message: "Registration session not found. Verify your email first." });
    }
    const user = users[0];
    const [security] = await connection.execute(
      "SELECT totp_enabled_at FROM user_security WHERE user_id = ? LIMIT 1",
      [user.id]
    );
    if (!security.length || !security[0].totp_enabled_at) {
      await connection.rollback();
      return res.status(403).json({ ok: false, message: "Verify Google Authenticator before entering personal information." });
    }

    const [existing] = await connection.execute(
      "SELECT user_id, customer_number FROM customer_profiles WHERE user_id = ? LIMIT 1",
      [user.id]
    );
    if (existing.length) {
      await connection.rollback();
      return res.status(409).json({
        ok: false,
        message: "Personal information has already been saved.",
        customerNumber: existing[0].customer_number,
        nextStep: "identity_verification"
      });
    }

    const customerNumber = await generateUniqueCustomerNumber(connection);
    await connection.execute(
      "INSERT INTO customer_profiles (user_id, customer_number, first_name, last_name, father_or_husband_name, date_of_birth, phone_country_code, phone_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [user.id, customerNumber, firstName, lastName, fatherOrHusbandName, dateOfBirth, phoneCountryCode, phoneNumber]
    );
    await connection.execute(
      "INSERT INTO customer_addresses (user_id, address_type, recipient_name, phone_country_code, phone_number, address_line_1, address_line_2, province, city, postal_code, country_code, is_default) VALUES (?, 'home', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
      [user.id, [firstName, lastName].filter(Boolean).join(" "), phoneCountryCode, phoneNumber, addressLine1, addressLine2, province, city, postalCode, countryCode]
    );
    await connection.commit();

    return res.status(201).json({
      ok: true,
      message: "Personal information saved. Continue to identity verification.",
      userId: publicId,
      customerNumber,
      nextStep: "identity_verification"
    });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
    }
    console.error("Saving customer personal information failed:", error.message);
    return res.status(503).json({ ok: false, message: "Could not save your information right now. Try again later." });
  } finally {
    if (connection) connection.release();
  }
});


const identityUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 2, fields: 10, parts: 12 },
  fileFilter: (_req, file, callback) => {
    const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!allowed.has(file.mimetype)) return callback(new Error("Upload JPG, PNG, or WEBP images only."));
    callback(null, true);
  }
});

function identityEncryptionKey() {
  const value = process.env.ID_DOCUMENT_ENCRYPTION_KEY || "";
  if (!/^[a-fA-F0-9]{64}$/.test(value)) throw new Error("ID_DOCUMENT_ENCRYPTION_KEY must be a 32-byte hex value.");
  return Buffer.from(value, "hex");
}

function encryptDocumentNumber(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", identityEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

function encryptIdentityFile(buffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", identityEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

function hasValidImageSignature(file) {
  const bytes = file.buffer;
  if (file.mimetype === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (file.mimetype === "image/png") return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (file.mimetype === "image/webp") return bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  return false;
}

function privateIdentityDirectory() {
  const directory = path.resolve(process.env.PRIVATE_UPLOAD_DIR || path.join(process.cwd(), "private-uploads"));
  const publicDirectory = path.resolve(process.cwd(), "public");
  const relative = path.relative(publicDirectory, directory);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    throw new Error("PRIVATE_UPLOAD_DIR must be outside the public directory.");
  }
  return directory;
}

function uploadIdentityFiles(req, res, next) {
  identityUpload.fields([
    { name: "frontDocument", maxCount: 1 },
    { name: "backDocument", maxCount: 1 }
  ])(req, res, (error) => {
    if (!error) return next();
    const message = error instanceof multer.MulterError
      ? (error.code === "LIMIT_FILE_SIZE" ? "Each document image must be 5 MB or smaller." : "Upload no more than one front image and one back image.")
      : error.message || "The document images could not be uploaded.";
    return res.status(400).json({ ok: false, message });
  });
}

router.post("/identity-verification", uploadIdentityFiles, async (req, res) => {
  const publicId = clean(req.body?.userId, 36);
  const documentType = clean(req.body?.documentType, 30);
  const documentNumber = clean(req.body?.documentNumber, 100);
  const issuingCountry = clean(req.body?.issuingCountry, 2).toUpperCase();
  const issueDate = clean(req.body?.issueDate, 10);
  const expiryDate = clean(req.body?.expiryDate, 10);
  const frontFile = req.files?.frontDocument?.[0] || null;
  const backFile = req.files?.backDocument?.[0] || null;
  const allowedTypes = new Set(["passport", "national_id", "residence_card", "visa", "driving_license"]);

  if (!publicId || !allowedTypes.has(documentType) || !documentNumber ||
      !/^[A-Z]{2}$/.test(issuingCountry) || !validDate(issueDate) || !validDate(expiryDate) ||
      issueDate > expiryDate || issueDate > new Date().toISOString().slice(0, 10) ||
      expiryDate < new Date().toISOString().slice(0, 10) || !frontFile) {
    return res.status(400).json({
      ok: false,
      message: "Enter all required ID details, valid dates and issuing country, and upload the front image. Expired documents cannot be submitted."
    });
  }
  if (documentNumber.length < 3 || !/^[\p{L}\p{N} .\-\/]+$/u.test(documentNumber)) {
    return res.status(400).json({ ok: false, message: "Check the document number and remove unsupported characters." });
  }
  for (const file of [frontFile, backFile].filter(Boolean)) {
    if (!hasValidImageSignature(file)) {
      return res.status(400).json({ ok: false, message: "A document image is not a valid JPG, PNG, or WEBP file." });
    }
  }
  if (documentType !== "passport" && !backFile) {
    return res.status(400).json({ ok: false, message: "Upload both front and back images for this document type." });
  }

  let connection;
  const writtenFiles = [];
  try {
    const encryptedNumber = encryptDocumentNumber(documentNumber);
    const root = privateIdentityDirectory();
    const directory = path.join(root, "identity-verification");
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });

    connection = await getPool().getConnection();
    await connection.beginTransaction();
    const [users] = await connection.execute(
      "SELECT id, email_verified_at, account_status FROM users WHERE public_id = ? LIMIT 1 FOR UPDATE", [publicId]
    );
    if (!users.length || !users[0].email_verified_at || users[0].account_status !== "pending") {
      await connection.rollback();
      return res.status(404).json({ ok: false, message: "Registration session not found. Verify your email first." });
    }
    const user = users[0];
    const [security] = await connection.execute(
      "SELECT totp_enabled_at FROM user_security WHERE user_id = ? LIMIT 1", [user.id]
    );
    const [profile] = await connection.execute(
      "SELECT user_id FROM customer_profiles WHERE user_id = ? LIMIT 1", [user.id]
    );
    if (!security.length || !security[0].totp_enabled_at || !profile.length) {
      await connection.rollback();
      return res.status(403).json({ ok: false, message: "Complete email, authenticator, and personal information steps first." });
    }
    const [existing] = await connection.execute(
      "SELECT id FROM identity_verifications WHERE user_id = ? AND verification_status IN ('pending','approved') LIMIT 1", [user.id]
    );
    if (existing.length) {
      await connection.rollback();
      return res.status(409).json({ ok: false, message: "An identity document is already pending review or approved." });
    }

    async function savePrivateFile(file) {
      if (!file) return null;
      const name = crypto.randomUUID() + ".enc";
      const fullPath = path.join(directory, name);
      await fs.writeFile(fullPath, encryptIdentityFile(file.buffer), { flag: "wx", mode: 0o600 });
      writtenFiles.push(fullPath);
      return path.posix.join("identity-verification", name);
    }
    const frontKey = await savePrivateFile(frontFile);
    const backKey = await savePrivateFile(backFile);
    await connection.execute(
      "INSERT INTO identity_verifications " +
      "(user_id, document_type, document_number_encrypted, issuing_country, issue_date, expiry_date, front_document_storage_key, back_document_storage_key, verification_status) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')",
      [user.id, documentType, encryptedNumber, issuingCountry, issueDate, expiryDate, frontKey, backKey]
    );
    await connection.commit();
    return res.status(201).json({
      ok: true,
      message: "Identity documents submitted securely for review. Your verification status is pending.",
      verificationStatus: "pending",
      nextStep: "contact_information"
    });
  } catch (error) {
    if (connection) { try { await connection.rollback(); } catch (_) {} }
    await Promise.all(writtenFiles.map((file) => fs.unlink(file).catch(() => {})));
    console.error("Identity document submission failed:", error.message);
    return res.status(503).json({
      ok: false,
      message: "Could not submit identity documents right now. Check server storage and encryption configuration, then try again."
    });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
