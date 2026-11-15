-- Deadline alternative to R2: small private photos, explicitly bounded to 1 MiB.
CREATE TABLE photo_bytes (
  photo_id TEXT PRIMARY KEY REFERENCES application_photos(id) ON DELETE CASCADE,
  bytes BLOB NOT NULL CHECK(length(bytes) <= 1048576)
);
CREATE TABLE claim_reservations (
 application_id TEXT PRIMARY KEY REFERENCES applications(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id)
);
