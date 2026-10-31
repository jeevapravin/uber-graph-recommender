-- Migration 001: Password reset tokens table
-- Run once against an existing database:
--   docker compose exec db mysql -ucab -pcabpass cab_booking < backend/sql/migration-001-reset-tokens.sql
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  token_hash  CHAR(64) NOT NULL,            -- SHA-256 hex digest of the raw token
  expires_at  TIMESTAMP NOT NULL,
  used_at     TIMESTAMP NULL DEFAULT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_token_hash (token_hash),
  INDEX idx_prt_user (user_id),
  INDEX idx_prt_expires (expires_at),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

