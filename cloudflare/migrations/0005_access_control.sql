-- Additive user access controls. Existing accounts and password hashes are preserved.
ALTER TABLE users ADD COLUMN disabled_at TEXT;
ALTER TABLE users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN user_auth_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN authenticated_at TEXT;
CREATE TABLE super_admin_identity (
 singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
 user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
 bound_at TEXT NOT NULL
);
CREATE TABLE user_audit_log (
 id TEXT PRIMARY KEY,
 actor_id TEXT NOT NULL,
 target_id TEXT NOT NULL,
 action TEXT NOT NULL,
 at TEXT NOT NULL,
 details TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX user_audit_at ON user_audit_log(at DESC);
CREATE TRIGGER super_admin_valid_binding BEFORE INSERT ON super_admin_identity
WHEN NOT EXISTS (SELECT 1 FROM users WHERE id=NEW.user_id AND email='temuulenbayarjargal@icloud.com' COLLATE NOCASE AND role='admin' AND disabled_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'invalid_super_admin_binding'); END;
CREATE TRIGGER super_admin_binding_immutable BEFORE UPDATE ON super_admin_identity
BEGIN SELECT RAISE(ABORT, 'super_admin_binding_immutable'); END;
CREATE TRIGGER super_admin_binding_no_delete BEFORE DELETE ON super_admin_identity
BEGIN SELECT RAISE(ABORT, 'super_admin_binding_immutable'); END;
CREATE TRIGGER super_admin_user_protected BEFORE UPDATE ON users
WHEN EXISTS (SELECT 1 FROM super_admin_identity WHERE user_id=OLD.id)
 AND (NEW.id<>OLD.id OR NEW.email<>OLD.email OR NEW.role<>'admin' OR NEW.disabled_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'super_admin_protected'); END;
CREATE TRIGGER super_admin_user_no_delete BEFORE DELETE ON users
WHEN EXISTS (SELECT 1 FROM super_admin_identity WHERE user_id=OLD.id)
BEGIN SELECT RAISE(ABORT, 'super_admin_protected'); END;
CREATE TRIGGER user_audit_immutable BEFORE UPDATE ON user_audit_log
BEGIN SELECT RAISE(ABORT, 'audit_immutable'); END;
CREATE TRIGGER user_audit_no_delete BEFORE DELETE ON user_audit_log
BEGIN SELECT RAISE(ABORT, 'audit_immutable'); END;
CREATE TRIGGER super_admin_binding_audit AFTER INSERT ON super_admin_identity
BEGIN
 UPDATE users SET auth_version=auth_version+1 WHERE id=NEW.user_id;
 DELETE FROM sessions WHERE user_id=NEW.user_id;
 INSERT INTO user_audit_log(id,actor_id,target_id,action,at,details)
 VALUES('super-admin-bind:' || NEW.user_id,'operator-bootstrap',NEW.user_id,'super_admin.bind',NEW.bound_at,'{}');
END;
