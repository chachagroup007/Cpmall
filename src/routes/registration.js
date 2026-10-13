const express = require("express");
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

module.exports = router;
