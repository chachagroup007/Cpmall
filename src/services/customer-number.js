const crypto = require("node:crypto");
const { getPool } = require("../config/db");

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CUSTOMER_NUMBER_LENGTH = 15;
const MAX_ATTEMPTS = 10;

function randomCustomerNumber() {
  let result = "";
  for (let i = 0; i < CUSTOMER_NUMBER_LENGTH; i += 1) {
    result += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
  }
  return result;
}

async function generateUniqueCustomerNumber(connection = getPool()) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const candidate = randomCustomerNumber();
    const [rows] = await connection.execute(
      "SELECT user_id FROM customer_profiles WHERE customer_number = ? LIMIT 1",
      [candidate]
    );
    if (rows.length === 0) return candidate;
  }

  throw new Error("Could not allocate a unique customer number; retry the operation.");
}

module.exports = { generateUniqueCustomerNumber };
