-- Chacha Prime Marketplace (CPMALL)
-- One complete initial schema for a fresh MySQL 8.0+ database.
-- Import this file once into an empty database using phpMyAdmin.
-- This is not a migration. Back up any existing database before importing.
-- Do not store full payment-card numbers or CVV. Store provider tokens/references only.

SET NAMES utf8mb4;
SET time_zone = '+00:00';
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS roles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  role_code VARCHAR(40) NOT NULL,
  role_name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_code (role_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS permissions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  permission_code VARCHAR(100) NOT NULL,
  permission_name VARCHAR(150) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_permissions_code (permission_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id BIGINT UNSIGNED NOT NULL,
  permission_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id CHAR(36) NOT NULL,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NULL,
  email_verified_at DATETIME NULL,
  account_status ENUM('pending','active','suspended','closed') NOT NULL DEFAULT 'pending',
  last_login_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_public_id (public_id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_status (account_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_roles (
  user_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_security (
  user_id BIGINT UNSIGNED NOT NULL,
  totp_secret_encrypted VARBINARY(512) NULL,
  totp_enabled_at DATETIME NULL,
  recovery_codes_hash_json JSON NULL,
  password_changed_at DATETIME NULL,
  failed_login_count INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_user_security_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS email_otps (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  email VARCHAR(254) NOT NULL,
  purpose ENUM('registration','login','email_change','password_reset') NOT NULL,
  otp_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  attempt_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_email_otps_email_purpose (email, purpose, expires_at),
  CONSTRAINT fk_email_otps_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customer_profiles (
  user_id BIGINT UNSIGNED NOT NULL,
  customer_number CHAR(15) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NULL,
  father_or_husband_name VARCHAR(150) NOT NULL,
  date_of_birth DATE NULL,
  phone_country_code VARCHAR(8) NULL,
  phone_number VARCHAR(30) NULL,
  preferred_language VARCHAR(12) NOT NULL DEFAULT 'en',
  profile_image_url VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_customer_number (customer_number),
  CONSTRAINT fk_customer_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customer_addresses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  address_type ENUM('home','billing','shipping','other') NOT NULL DEFAULT 'home',
  recipient_name VARCHAR(200) NOT NULL,
  phone_country_code VARCHAR(8) NULL,
  phone_number VARCHAR(30) NULL,
  address_line_1 VARCHAR(255) NOT NULL,
  address_line_2 VARCHAR(255) NULL,
  province VARCHAR(120) NULL,
  city VARCHAR(120) NOT NULL,
  postal_code VARCHAR(30) NULL,
  country_code CHAR(2) NOT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_customer_addresses_user (user_id),
  CONSTRAINT fk_customer_addresses_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS identity_verifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  document_type ENUM('passport','national_id','residence_card','visa','driving_license') NOT NULL,
  document_number_encrypted VARBINARY(512) NULL,
  issuing_country CHAR(2) NULL,
  issue_date DATE NULL,
  expiry_date DATE NULL,
  front_document_storage_key VARCHAR(500) NULL,
  back_document_storage_key VARCHAR(500) NULL,
  verification_status ENUM('not_submitted','pending','approved','rejected','expired') NOT NULL DEFAULT 'not_submitted',
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  rejection_reason VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_identity_user_status (user_id, verification_status),
  CONSTRAINT fk_identity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_identity_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customer_social_contacts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  platform ENUM('wechat','whatsapp','facebook','instagram','youtube','skype','linkedin','imo','other') NOT NULL,
  contact_value VARCHAR(500) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_customer_social_platform (user_id, platform),
  CONSTRAINT fk_social_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS membership_tiers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tier_code VARCHAR(30) NOT NULL,
  tier_name VARCHAR(60) NOT NULL,
  sort_order TINYINT UNSIGNED NOT NULL,
  qualification_mode ENUM('orders_or_spend','orders_and_spend','orders_only','spend_only','manual') NOT NULL DEFAULT 'orders_or_spend',
  minimum_completed_orders INT UNSIGNED NOT NULL DEFAULT 0,
  minimum_completed_spend DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  benefits_json JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_membership_tier_code (tier_code),
  UNIQUE KEY uq_membership_tier_order (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customer_memberships (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  tier_id BIGINT UNSIGNED NOT NULL,
  status ENUM('active','paused','expired') NOT NULL DEFAULT 'active',
  effective_from DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  effective_until DATETIME NULL,
  qualifying_completed_orders INT UNSIGNED NOT NULL DEFAULT 0,
  qualifying_completed_spend DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  last_evaluated_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_customer_memberships_user_status (user_id, status),
  CONSTRAINT fk_customer_memberships_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_customer_memberships_tier FOREIGN KEY (tier_id) REFERENCES membership_tiers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS membership_cards (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  membership_id BIGINT UNSIGNED NOT NULL,
  card_number CHAR(15) NOT NULL,
  qr_payload VARCHAR(500) NOT NULL,
  card_status ENUM('active','suspended','replaced','expired') NOT NULL DEFAULT 'active',
  issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NULL,
  replaced_by_card_id BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_membership_card_number (card_number),
  UNIQUE KEY uq_membership_card_qr_payload (qr_payload),
  KEY idx_membership_cards_user_status (user_id, card_status),
  CONSTRAINT fk_membership_cards_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_membership_cards_membership FOREIGN KEY (membership_id) REFERENCES customer_memberships(id),
  CONSTRAINT fk_membership_cards_replacement FOREIGN KEY (replaced_by_card_id) REFERENCES membership_cards(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_customers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  provider_code VARCHAR(40) NOT NULL,
  provider_customer_reference VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_customer_provider_ref (provider_code, provider_customer_reference),
  UNIQUE KEY uq_payment_customer_user_provider (user_id, provider_code),
  CONSTRAINT fk_payment_customers_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS saved_payment_methods (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  provider_code VARCHAR(40) NOT NULL,
  provider_payment_method_reference VARCHAR(255) NOT NULL,
  method_type ENUM('card','wallet','bank_account','other') NOT NULL DEFAULT 'card',
  card_brand VARCHAR(40) NULL,
  card_last_four CHAR(4) NULL,
  card_expiry_month TINYINT UNSIGNED NULL,
  card_expiry_year SMALLINT UNSIGNED NULL,
  billing_name VARCHAR(200) NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  method_status ENUM('active','expired','removed') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_saved_payment_provider_ref (provider_code, provider_payment_method_reference),
  KEY idx_saved_payment_methods_user (user_id, method_status),
  CONSTRAINT fk_saved_payment_methods_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vendors (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_user_id BIGINT UNSIGNED NOT NULL,
  vendor_code VARCHAR(40) NOT NULL,
  legal_business_name VARCHAR(200) NOT NULL,
  display_name VARCHAR(200) NOT NULL,
  slug VARCHAR(220) NOT NULL,
  business_type ENUM('individual','company','factory','distributor','wholesaler','retailer') NOT NULL,
  registration_number_encrypted VARBINARY(512) NULL,
  tax_number_encrypted VARBINARY(512) NULL,
  country_code CHAR(2) NOT NULL,
  business_address_json JSON NULL,
  return_address_json JSON NULL,
  approval_status ENUM('draft','pending','approved','rejected','suspended') NOT NULL DEFAULT 'draft',
  approved_by BIGINT UNSIGNED NULL,
  approved_at DATETIME NULL,
  commission_rate DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_vendors_code (vendor_code),
  UNIQUE KEY uq_vendors_slug (slug),
  KEY idx_vendors_approval_status (approval_status),
  CONSTRAINT fk_vendors_owner FOREIGN KEY (owner_user_id) REFERENCES users(id),
  CONSTRAINT fk_vendors_approver FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vendor_documents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  vendor_id BIGINT UNSIGNED NOT NULL,
  document_type ENUM('business_license','tax_certificate','owner_id','proof_of_address','bank_proof','product_compliance','other') NOT NULL,
  storage_key VARCHAR(500) NOT NULL,
  status ENUM('pending','approved','rejected','expired') NOT NULL DEFAULT 'pending',
  expiry_date DATE NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_vendor_documents_status (vendor_id, status),
  CONSTRAINT fk_vendor_documents_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
  CONSTRAINT fk_vendor_documents_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vendor_payout_accounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  vendor_id BIGINT UNSIGNED NOT NULL,
  provider_code VARCHAR(40) NOT NULL,
  provider_account_reference VARCHAR(255) NULL,
  account_holder_name VARCHAR(200) NOT NULL,
  account_details_encrypted VARBINARY(1024) NULL,
  verification_status ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending',
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_vendor_payout_accounts_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  parent_id BIGINT UNSIGNED NULL,
  category_name VARCHAR(150) NOT NULL,
  slug VARCHAR(180) NOT NULL,
  description TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_slug (slug),
  CONSTRAINT fk_categories_parent FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS products (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_code VARCHAR(60) NOT NULL,
  slug VARCHAR(220) NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  short_description VARCHAR(600) NULL,
  long_description MEDIUMTEXT NULL,
  highlights_json JSON NULL,
  specifications_json JSON NULL,
  brand_name VARCHAR(150) NULL,
  product_status ENUM('draft','pending_review','active','rejected','archived') NOT NULL DEFAULT 'draft',
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_products_code (product_code),
  UNIQUE KEY uq_products_slug (slug),
  KEY idx_products_status (product_status),
  CONSTRAINT fk_products_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_categories (
  product_id BIGINT UNSIGNED NOT NULL,
  category_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (product_id, category_id),
  CONSTRAINT fk_product_categories_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_product_categories_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_media (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id BIGINT UNSIGNED NOT NULL,
  media_type ENUM('image','video') NOT NULL DEFAULT 'image',
  storage_url VARCHAR(1000) NOT NULL,
  alt_text VARCHAR(255) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_product_media_product (product_id, sort_order),
  CONSTRAINT fk_product_media_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_variants (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id BIGINT UNSIGNED NOT NULL,
  sku VARCHAR(100) NOT NULL,
  variant_name VARCHAR(200) NOT NULL,
  option_values_json JSON NULL,
  weight_grams INT UNSIGNED NULL,
  dimensions_json JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_product_variants_sku (sku),
  CONSTRAINT fk_product_variants_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vendor_listings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  vendor_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NULL,
  vendor_sku VARCHAR(100) NULL,
  retail_price DECIMAL(14,2) NOT NULL,
  wholesale_price DECIMAL(14,2) NULL,
  factory_price DECIMAL(14,2) NULL,
  currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  wholesale_min_quantity INT UNSIGNED NOT NULL DEFAULT 1,
  stock_quantity INT NOT NULL DEFAULT 0,
  low_stock_threshold INT UNSIGNED NOT NULL DEFAULT 5,
  fulfillment_type ENUM('vendor_ships','marketplace_fulfilled') NOT NULL DEFAULT 'vendor_ships',
  listing_status ENUM('draft','active','paused','out_of_stock','rejected') NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_vendor_listings_product (product_id, listing_status),
  KEY idx_vendor_listings_vendor (vendor_id, listing_status),
  CONSTRAINT fk_vendor_listings_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id),
  CONSTRAINT fk_vendor_listings_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_vendor_listings_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL,
  CONSTRAINT chk_vendor_listing_retail_price CHECK (retail_price >= 0),
  CONSTRAINT chk_vendor_listing_stock CHECK (stock_quantity >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventory_movements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  listing_id BIGINT UNSIGNED NOT NULL,
  movement_type ENUM('stock_in','sale','return','adjustment','reservation','release') NOT NULL,
  quantity_change INT NOT NULL,
  reference_type VARCHAR(40) NULL,
  reference_id BIGINT UNSIGNED NULL,
  note VARCHAR(500) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_inventory_movements_listing_date (listing_id, created_at),
  CONSTRAINT fk_inventory_movements_listing FOREIGN KEY (listing_id) REFERENCES vendor_listings(id),
  CONSTRAINT fk_inventory_movements_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS currencies (
  currency_code CHAR(3) NOT NULL,
  currency_name VARCHAR(80) NOT NULL,
  currency_symbol VARCHAR(8) NULL,
  decimal_places TINYINT UNSIGNED NOT NULL DEFAULT 2,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (currency_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS exchange_rates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  base_currency CHAR(3) NOT NULL,
  quote_currency CHAR(3) NOT NULL,
  rate DECIMAL(20,10) NOT NULL,
  source_name VARCHAR(100) NULL,
  observed_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_exchange_rate_pair_time (base_currency, quote_currency, observed_at),
  CONSTRAINT fk_exchange_base FOREIGN KEY (base_currency) REFERENCES currencies(currency_code),
  CONSTRAINT fk_exchange_quote FOREIGN KEY (quote_currency) REFERENCES currencies(currency_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS carts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  session_key VARCHAR(128) NULL,
  currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_carts_user (user_id),
  UNIQUE KEY uq_carts_session_key (session_key),
  CONSTRAINT fk_carts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cart_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cart_id BIGINT UNSIGNED NOT NULL,
  listing_id BIGINT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cart_listing (cart_id, listing_id),
  CONSTRAINT fk_cart_items_cart FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE,
  CONSTRAINT fk_cart_items_listing FOREIGN KEY (listing_id) REFERENCES vendor_listings(id),
  CONSTRAINT chk_cart_item_quantity CHECK (quantity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_number VARCHAR(40) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  subtotal_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  shipping_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  order_status ENUM('pending_payment','paid','confirmed','packing','shipped','delivered','cancelled','refunded','partially_refunded') NOT NULL DEFAULT 'pending_payment',
  payment_status ENUM('unpaid','authorized','paid','partially_refunded','refunded','failed') NOT NULL DEFAULT 'unpaid',
  gift_option TINYINT(1) NOT NULL DEFAULT 0,
  gift_message VARCHAR(500) NULL,
  customer_note VARCHAR(1000) NULL,
  placed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_number (order_number),
  KEY idx_orders_user_date (user_id, placed_at),
  KEY idx_orders_status (order_status, payment_status),
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_orders_currency FOREIGN KEY (currency_code) REFERENCES currencies(currency_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_addresses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  address_type ENUM('shipping','billing') NOT NULL,
  recipient_name VARCHAR(200) NOT NULL,
  phone_number VARCHAR(40) NULL,
  address_line_1 VARCHAR(255) NOT NULL,
  address_line_2 VARCHAR(255) NULL,
  province VARCHAR(120) NULL,
  city VARCHAR(120) NOT NULL,
  postal_code VARCHAR(30) NULL,
  country_code CHAR(2) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_order_addresses_order (order_id),
  CONSTRAINT fk_order_addresses_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vendor_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  vendor_id BIGINT UNSIGNED NOT NULL,
  vendor_order_number VARCHAR(50) NOT NULL,
  subtotal_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  commission_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  shipping_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  status ENUM('pending','confirmed','packing','shipped','delivered','cancelled','returned') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_vendor_order_number (vendor_order_number),
  KEY idx_vendor_orders_vendor_status (vendor_id, status),
  CONSTRAINT fk_vendor_orders_order FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT fk_vendor_orders_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  vendor_order_id BIGINT UNSIGNED NOT NULL,
  listing_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NULL,
  product_name_snapshot VARCHAR(255) NOT NULL,
  sku_snapshot VARCHAR(100) NULL,
  quantity INT UNSIGNED NOT NULL,
  unit_price DECIMAL(14,2) NOT NULL,
  line_total DECIMAL(14,2) NOT NULL,
  currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_order_items_order (order_id),
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT fk_order_items_vendor_order FOREIGN KEY (vendor_order_id) REFERENCES vendor_orders(id),
  CONSTRAINT fk_order_items_listing FOREIGN KEY (listing_id) REFERENCES vendor_listings(id),
  CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_order_items_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL,
  CONSTRAINT fk_order_items_currency FOREIGN KEY (currency_code) REFERENCES currencies(currency_code),
  CONSTRAINT chk_order_items_quantity CHECK (quantity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_status_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  old_status VARCHAR(40) NULL,
  new_status VARCHAR(40) NOT NULL,
  note VARCHAR(500) NULL,
  changed_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_order_status_history_order (order_id, created_at),
  CONSTRAINT fk_order_status_history_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_order_status_history_user FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS group_deals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  deal_code VARCHAR(50) NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  listing_id BIGINT UNSIGNED NOT NULL,
  deal_name VARCHAR(255) NOT NULL,
  target_type ENUM('buyer_count','total_quantity','either','both') NOT NULL DEFAULT 'buyer_count',
  target_buyer_count INT UNSIGNED NULL,
  target_total_quantity INT UNSIGNED NULL,
  current_buyer_count INT UNSIGNED NOT NULL DEFAULT 0,
  current_total_quantity INT UNSIGNED NOT NULL DEFAULT 0,
  deal_price DECIMAL(14,2) NOT NULL,
  currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  deal_status ENUM('draft','scheduled','active','successful','failed','cancelled','settled') NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_group_deals_code (deal_code),
  KEY idx_group_deals_status_dates (deal_status, starts_at, ends_at),
  CONSTRAINT fk_group_deals_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_group_deals_listing FOREIGN KEY (listing_id) REFERENCES vendor_listings(id),
  CONSTRAINT fk_group_deals_currency FOREIGN KEY (currency_code) REFERENCES currencies(currency_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS group_deal_members (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  deal_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  order_id BIGINT UNSIGNED NULL,
  quantity INT UNSIGNED NOT NULL DEFAULT 1,
  paid_amount DECIMAL(14,2) NOT NULL,
  payment_status ENUM('pending','paid','refunded','failed') NOT NULL DEFAULT 'pending',
  joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_group_deal_user (deal_id, user_id),
  KEY idx_group_deal_members_payment (deal_id, payment_status),
  CONSTRAINT fk_group_deal_members_deal FOREIGN KEY (deal_id) REFERENCES group_deals(id),
  CONSTRAINT fk_group_deal_members_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_group_deal_members_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
  CONSTRAINT chk_group_deal_member_quantity CHECK (quantity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  provider_code VARCHAR(40) NOT NULL,
  provider_transaction_reference VARCHAR(255) NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  transaction_type ENUM('payment','authorization','capture','refund','void') NOT NULL,
  transaction_status ENUM('created','pending','succeeded','failed','cancelled') NOT NULL DEFAULT 'created',
  amount DECIMAL(14,2) NOT NULL,
  currency_code CHAR(3) NOT NULL,
  safe_response_json JSON NULL,
  processed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_idempotency_key (idempotency_key),
  UNIQUE KEY uq_payment_provider_ref (provider_code, provider_transaction_reference),
  KEY idx_payment_transactions_order (order_id, transaction_status),
  CONSTRAINT fk_payment_transactions_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
  CONSTRAINT fk_payment_transactions_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_payment_transactions_currency FOREIGN KEY (currency_code) REFERENCES currencies(currency_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS refunds (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  payment_transaction_id BIGINT UNSIGNED NULL,
  provider_refund_reference VARCHAR(255) NULL,
  refund_reason VARCHAR(500) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  currency_code CHAR(3) NOT NULL,
  refund_status ENUM('requested','approved','processing','succeeded','failed','rejected') NOT NULL DEFAULT 'requested',
  requested_by BIGINT UNSIGNED NOT NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  processed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_refunds_order_status (order_id, refund_status),
  CONSTRAINT fk_refunds_order FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT fk_refunds_payment FOREIGN KEY (payment_transaction_id) REFERENCES payment_transactions(id) ON DELETE SET NULL,
  CONSTRAINT fk_refunds_currency FOREIGN KEY (currency_code) REFERENCES currencies(currency_code),
  CONSTRAINT fk_refunds_requester FOREIGN KEY (requested_by) REFERENCES users(id),
  CONSTRAINT fk_refunds_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vendor_payouts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  vendor_id BIGINT UNSIGNED NOT NULL,
  payout_account_id BIGINT UNSIGNED NULL,
  payout_reference VARCHAR(255) NULL,
  amount DECIMAL(14,2) NOT NULL,
  currency_code CHAR(3) NOT NULL,
  payout_status ENUM('pending','processing','paid','failed','cancelled') NOT NULL DEFAULT 'pending',
  period_start DATE NULL,
  period_end DATE NULL,
  processed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_vendor_payouts_vendor_status (vendor_id, payout_status),
  CONSTRAINT fk_vendor_payouts_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id),
  CONSTRAINT fk_vendor_payouts_account FOREIGN KEY (payout_account_id) REFERENCES vendor_payout_accounts(id) ON DELETE SET NULL,
  CONSTRAINT fk_vendor_payouts_currency FOREIGN KEY (currency_code) REFERENCES currencies(currency_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shipping_methods (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  method_code VARCHAR(50) NOT NULL,
  method_name VARCHAR(120) NOT NULL,
  carrier_name VARCHAR(120) NULL,
  tracking_supported TINYINT(1) NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_shipping_methods_code (method_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shipping_zones (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  zone_name VARCHAR(120) NOT NULL,
  country_codes_json JSON NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shipping_rates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  zone_id BIGINT UNSIGNED NOT NULL,
  method_id BIGINT UNSIGNED NOT NULL,
  currency_code CHAR(3) NOT NULL,
  base_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  per_kg_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  estimated_min_days TINYINT UNSIGNED NULL,
  estimated_max_days TINYINT UNSIGNED NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  CONSTRAINT fk_shipping_rates_zone FOREIGN KEY (zone_id) REFERENCES shipping_zones(id) ON DELETE CASCADE,
  CONSTRAINT fk_shipping_rates_method FOREIGN KEY (method_id) REFERENCES shipping_methods(id),
  CONSTRAINT fk_shipping_rates_currency FOREIGN KEY (currency_code) REFERENCES currencies(currency_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shipments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  vendor_order_id BIGINT UNSIGNED NOT NULL,
  shipping_method_id BIGINT UNSIGNED NULL,
  tracking_number VARCHAR(150) NULL,
  tracking_url VARCHAR(1000) NULL,
  shipment_status ENUM('pending','label_created','shipped','in_transit','out_for_delivery','delivered','exception','returned') NOT NULL DEFAULT 'pending',
  shipped_at DATETIME NULL,
  delivered_at DATETIME NULL,
  tracking_events_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_shipments_tracking (tracking_number),
  CONSTRAINT fk_shipments_vendor_order FOREIGN KEY (vendor_order_id) REFERENCES vendor_orders(id),
  CONSTRAINT fk_shipments_method FOREIGN KEY (shipping_method_id) REFERENCES shipping_methods(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS returns (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_item_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  return_reason VARCHAR(500) NOT NULL,
  requested_quantity INT UNSIGNED NOT NULL,
  return_status ENUM('requested','approved','rejected','in_transit','received','refunded','closed') NOT NULL DEFAULT 'requested',
  resolution ENUM('refund','replacement','store_credit','pending') NOT NULL DEFAULT 'pending',
  reviewed_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_returns_order_item FOREIGN KEY (order_item_id) REFERENCES order_items(id),
  CONSTRAINT fk_returns_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_returns_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS coupons (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  coupon_code VARCHAR(60) NOT NULL,
  discount_type ENUM('fixed','percentage','free_shipping') NOT NULL,
  discount_value DECIMAL(14,2) NOT NULL DEFAULT 0,
  currency_code CHAR(3) NULL,
  minimum_order_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  maximum_discount_amount DECIMAL(14,2) NULL,
  usage_limit INT UNSIGNED NULL,
  per_user_limit INT UNSIGNED NULL,
  starts_at DATETIME NULL,
  ends_at DATETIME NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_coupons_code (coupon_code),
  CONSTRAINT fk_coupons_currency FOREIGN KEY (currency_code) REFERENCES currencies(currency_code) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  coupon_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  order_id BIGINT UNSIGNED NOT NULL,
  discount_amount DECIMAL(14,2) NOT NULL,
  redeemed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_coupon_redemption_order (coupon_id, order_id),
  CONSTRAINT fk_coupon_redemptions_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id),
  CONSTRAINT fk_coupon_redemptions_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_coupon_redemptions_order FOREIGN KEY (order_id) REFERENCES orders(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  order_item_id BIGINT UNSIGNED NULL,
  rating TINYINT UNSIGNED NOT NULL,
  review_title VARCHAR(200) NULL,
  review_text TEXT NULL,
  media_json JSON NULL,
  review_status ENUM('pending','published','hidden','rejected') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_reviews_product_status (product_id, review_status),
  CONSTRAINT fk_reviews_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_reviews_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_reviews_order_item FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE SET NULL,
  CONSTRAINT chk_reviews_rating CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wishlists (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  wishlist_name VARCHAR(120) NOT NULL DEFAULT 'My Wishlist',
  is_default TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_wishlists_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wishlist_items (
  wishlist_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (wishlist_id, product_id),
  CONSTRAINT fk_wishlist_items_wishlist FOREIGN KEY (wishlist_id) REFERENCES wishlists(id) ON DELETE CASCADE,
  CONSTRAINT fk_wishlist_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  notification_type VARCHAR(60) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message VARCHAR(1000) NOT NULL,
  data_json JSON NULL,
  read_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notifications_user_unread (user_id, read_at, created_at),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id BIGINT UNSIGNED NULL,
  action_code VARCHAR(100) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(100) NULL,
  ip_address VARBINARY(16) NULL,
  user_agent VARCHAR(500) NULL,
  details_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_logs_entity (entity_type, entity_id, created_at),
  KEY idx_audit_logs_actor (actor_user_id, created_at),
  CONSTRAINT fk_audit_logs_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS webhook_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  provider_code VARCHAR(40) NOT NULL,
  provider_event_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(120) NOT NULL,
  payload_json JSON NOT NULL,
  processing_status ENUM('received','processing','processed','failed','ignored') NOT NULL DEFAULT 'received',
  received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_webhook_provider_event (provider_code, provider_event_id),
  KEY idx_webhook_processing_status (processing_status, received_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS idempotency_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  idempotency_key VARCHAR(128) NOT NULL,
  operation_code VARCHAR(100) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  response_status SMALLINT UNSIGNED NULL,
  response_json JSON NULL,
  completed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_idempotency_key (idempotency_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO roles (role_code, role_name, description) VALUES
('customer','Customer','Marketplace customer'),
('vendor','Vendor','Approved marketplace seller'),
('admin','Administrator','Marketplace administration')
ON DUPLICATE KEY UPDATE role_name = VALUES(role_name);

INSERT INTO membership_tiers
(tier_code, tier_name, sort_order, qualification_mode, minimum_completed_orders, minimum_completed_spend, currency_code, benefits_json, is_active)
VALUES
('BRONZE','Bronze',1,'manual',0,0.00,'USD',JSON_OBJECT('description','Welcome membership','discount_percent',0),1),
('SILVER','Silver',2,'orders_or_spend',5,250.00,'USD',JSON_OBJECT('description','Growing customer rewards','discount_percent',1),1),
('GOLD','Gold',3,'orders_or_spend',15,1000.00,'USD',JSON_OBJECT('description','Enhanced member rewards','discount_percent',2),1),
('PLATINUM','Platinum',4,'orders_or_spend',30,3000.00,'USD',JSON_OBJECT('description','Premium member rewards','discount_percent',3),1),
('DIAMOND','Diamond',5,'orders_or_spend',60,7500.00,'USD',JSON_OBJECT('description','High-tier member rewards','discount_percent',4),1),
('VIP','VIP',6,'orders_or_spend',100,15000.00,'USD',JSON_OBJECT('description','Priority customer benefits','discount_percent',5),1),
('ELITE','Elite',7,'orders_or_spend',200,40000.00,'USD',JSON_OBJECT('description','Highest membership tier','discount_percent',7),1)
ON DUPLICATE KEY UPDATE
tier_name = VALUES(tier_name),
qualification_mode = VALUES(qualification_mode),
minimum_completed_orders = VALUES(minimum_completed_orders),
minimum_completed_spend = VALUES(minimum_completed_spend),
benefits_json = VALUES(benefits_json),
is_active = VALUES(is_active);

INSERT INTO currencies (currency_code, currency_name, currency_symbol, decimal_places, is_active) VALUES
('USD','US Dollar','$',2,1),
('EUR','Euro','€',2,1),
('GBP','Pound Sterling','£',2,1),
('CNY','Chinese Yuan','¥',2,1),
('PKR','Pakistani Rupee','₨',2,1),
('AED','UAE Dirham','د.إ',2,1),
('SAR','Saudi Riyal','ر.س',2,1)
ON DUPLICATE KEY UPDATE currency_name = VALUES(currency_name), currency_symbol = VALUES(currency_symbol), is_active = VALUES(is_active);

INSERT INTO permissions (permission_code, permission_name) VALUES
('catalog.read','View product catalog'),
('catalog.manage','Manage product catalog'),
('orders.read.own','View own orders'),
('orders.manage.all','Manage all orders'),
('vendors.apply','Apply to become a vendor'),
('vendors.review','Approve or reject vendor applications'),
('memberships.manage','Manage membership rules'),
('payments.manage','Manage payment transactions'),
('settings.manage','Manage marketplace settings')
ON DUPLICATE KEY UPDATE permission_name = VALUES(permission_name);

INSERT INTO shipping_methods (method_code, method_name, carrier_name, tracking_supported, is_active) VALUES
('STANDARD','Standard Shipping',NULL,1,1),
('EXPRESS','Express Shipping',NULL,1,1)
ON DUPLICATE KEY UPDATE method_name = VALUES(method_name), is_active = VALUES(is_active);

SET FOREIGN_KEY_CHECKS = 1;
