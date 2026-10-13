# Chacha Prime Marketplace (CPMALL)

A multi-vendor retail and wholesale marketplace foundation built with Node.js, Express, and MySQL.

## Current foundation
- Express server with health and database status endpoints.
- MySQL connection pool configured through environment variables.
- Single complete MySQL schema at `database/chacha_marketplace.sql` (not a migration).
- Customer membership levels: Bronze, Silver, Gold, Platinum, Diamond, VIP, Elite.
- Customer membership-card records and QR payload support.
- Payment-provider customer/payment references; raw card numbers and CVV are not stored.
- Shared product catalog with vendor-specific listings and inventory.
- Orders, group buying, refunds, vendor payouts, shipping, reviews, notifications, audit records, and registration/profile tables.

## Requirements
- Node.js 20+
- MySQL 8.0+
- phpMyAdmin (optional, for importing the schema)

## Setup
1. Create a MySQL database, for example `cpmall`.
2. Import the entire `database/chacha_marketplace.sql` file once using phpMyAdmin.
3. Copy `.env.example` to `.env` and fill in your own database settings.
4. Install dependencies: `npm install`
5. Start in development: `npm run dev`
6. Open `http://localhost:3000/api/health`.

## Security notes
- Never commit `.env`, SMTP passwords, API keys, or payment secrets.
- Rotate any SMTP password previously pasted into a chat.
- Never store a full payment-card number or CVV. Use a PCI-compliant payment provider's hosted checkout/tokenization and store only provider references and safe card metadata.
- Identity documents and personal data must be protected by access controls, encryption where appropriate, retention rules, and HTTPS in production.

## Membership rules
Membership eligibility is configurable in `membership_tiers`. Rules may consider completed-order count, completed spend, or both. The initial thresholds in the schema are examples and should be reviewed before launch.

## Important
This is the initial application foundation, not a finished production marketplace. Remaining registration stages, payment provider callbacks, admin approval workflows, shipping integrations, and full checkout must be implemented and tested before accepting real customers or payments.


## Email verification API

The first customer-registration stage is available through these endpoints:

- `POST /api/auth/registration/send-otp` with JSON `{"email":"customer@example.com"}`
- `POST /api/auth/registration/verify-otp` with JSON `{"email":"customer@example.com","otp":"123456"}`

Codes expire after 10 minutes, are stored as salted scrypt hashes, have a five-attempt limit, and are subject to resend and hourly limits. Configure SMTP using server environment variables. Copy `.env.example` to a private `.env` on your server and replace placeholders; never commit real credentials.

Email verification is only the first registration stage. Authenticator setup, personal details, identity documents, membership-card issuing, sessions, and the remaining customer/vendor flows are not yet complete. Do not treat this foundation as production-ready until the full flow and security controls have been implemented and tested.


## Google Authenticator registration stage

After email verification, the app can create a TOTP secret and QR code, show a manual setup key, and verify six-digit Google Authenticator codes. The TOTP secret is encrypted at rest with AES-256-GCM. Configure `TOTP_ENCRYPTION_KEY` as a private 64-character hex string generated with `openssl rand -hex 32`. Keep the same key safe and stable; changing it makes existing encrypted secrets unreadable. The QR code and authenticator endpoints still require end-to-end testing on the target server before production use.
