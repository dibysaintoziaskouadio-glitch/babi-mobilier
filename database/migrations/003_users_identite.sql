-- Inscription : prénom et nom séparés, e-mail unique pour les comptes clients de la plateforme.
BEGIN;

ALTER TABLE users
  ADD COLUMN first_name text,
  ADD COLUMN last_name  text,
  ADD CONSTRAINT users_email_format CHECK (email IS NULL OR email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');

-- Comptes déjà créés : on découpe full_name sur le premier espace.
UPDATE users
   SET first_name = split_part(full_name, ' ', 1),
       last_name  = nullif(substr(full_name, length(split_part(full_name, ' ', 1)) + 2), '')
 WHERE first_name IS NULL;

-- citext : « Aya@Mail.ci » et « aya@mail.ci » sont la même adresse.
CREATE UNIQUE INDEX uq_users_platform_email ON users (email) WHERE tenant_id IS NULL AND email IS NOT NULL;

COMMIT;
