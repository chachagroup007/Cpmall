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
This is the initial application foundation, not a finished production marketplace. Authentication, OTP/TOTP verification, payment provider callbacks, admin approval workflows, shipping integrations, and full checkout must be implemented and tested before accepting real customers or payments.
