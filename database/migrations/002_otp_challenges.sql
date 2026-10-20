-- Codes de connexion à usage unique (OTP) envoyés par WhatsApp ou SMS.
BEGIN;

CREATE TABLE otp_challenges (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone        text        NOT NULL,
  code_hash    text        NOT NULL,                 -- SHA-256(code + téléphone + secret), jamais le code en clair
  channel      text        NOT NULL DEFAULT 'whatsapp',
  attempts     smallint    NOT NULL DEFAULT 0,
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  ip           inet,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT otp_phone_format CHECK (phone ~ '^\+225[0-9]{10}$'),
  CONSTRAINT otp_channel      CHECK (channel IN ('whatsapp', 'sms')),
  CONSTRAINT otp_attempts     CHECK (attempts BETWEEN 0 AND 10)
);
CREATE INDEX idx_otp_phone_time ON otp_challenges (phone, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON otp_challenges TO babi_app;

COMMIT;
