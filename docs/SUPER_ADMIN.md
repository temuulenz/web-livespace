# Super Admin access control

The sole designated account is `temuulenbayarjargal@icloud.com`. Runtime authority comes from the immutable `super_admin_identity.user_id` singleton, not request fields, a browser email check, or a new public role string. The account retains the existing `admin` role and receives a server-computed `is_super_admin` capability. Owners/users keep their previous permissions; regular admins retain cafe/device/owner/normal-user access.

## Permissions and API

| Operation | Regular Admin | Super Admin |
| --- | --- | --- |
| Read admin user list | Yes | Yes |
| Create/manage normal users and owners | Yes | Yes |
| Create/promote/demote/disable/reset an administrator | No | Yes |
| Change the Super Admin through user-management endpoints | No | No |
| Read privileged user audit log | No | Yes |

`POST /api/v1/admin/users` creates a user, owner or (Super Admin only) administrator. `PATCH /api/v1/admin/users/:id` accepts only `name`, `role`, and boolean `disabled`. `POST /api/v1/admin/users/:id/password` accepts only a new `password` (12–200 characters). There is no user-deletion endpoint. Super Admin targets are protected even when the actor is the Super Admin. IDs, email changes, capability flags and authentication versions cannot be mass-assigned.

All these writes require password authentication in the last five minutes. Fresh login qualifies; older/migrated sessions use `POST /api/v1/auth/reauthenticate` with the current password. This is rate-limited, server-side session state, never a client timestamp. The Users screen contains the confirmation form and hides administrator controls from regular admins. Password inputs clear before requests and are never persisted in component state.

`server/services/user-access.mjs` supplies the policy for both Node/SQLite and Cloudflare/D1. Every mutation checks actor role, disabled state, session/version, recent authentication, target version and Super Admin identity inside SQL, after any asynchronous password hashing. The mutation, immutable audit event and affected-session deletion run in one SQLite transaction / D1 batch. Successful changes increment `users.auth_version`; session lookups require matching versions. Disabled users cannot log in. Login also checks the version when creating a session to prevent racing a password/privilege change.

`GET /api/v1/admin/audit` returns at most 200 recent successful actions, with actor ID, target ID, action, UTC time and limited role/disabled metadata. No passwords, password hashes or session tokens enter the audit log or responses. Database triggers prevent modifying/deleting audit records and prevent deleting/disabling/demoting/renaming/rebinding the Super Admin identity through normal SQL/application paths. A database operator remains a trusted maintenance boundary.

## Additive migrations and operator bootstrap

Node migration 4 and D1 `0005_access_control.sql` add disabled/auth-version columns, session authentication/version columns, the immutable identity, audit table and triggers. Existing password hashes/accounts are untouched. The pre-Android v1 fixture is not regenerated. Existing sessions remain usable if versions match, but need password confirmation for sensitive actions.

After applying the migration, run:

```bash
# Local configured SQLite database
node scripts/bootstrap-super-admin.mjs --local

# Existing production account: assert the ID resolved through a trusted D1 lookup
node scripts/bootstrap-super-admin.mjs --remote --expected-id usr_d34a7a1973194b4e
```

The production lookup found that existing administrator ID; bootstrap must preserve its credentials. Binding is a single insert for an existing administrator, with an atomic trigger that revokes that account's prior sessions and records `super_admin.bind`. Other accounts and cafe/sensor data are unaffected. A repeat run validates the identity and makes no changes. No web endpoint can perform this binding.

If the designated account is absent, the tool requests and confirms a password through a hidden interactive terminal prompt. Do not pass passwords in shell arguments, chat, environment variables or files. It refuses absent/short passwords, disabled designated accounts, conflicting bindings and mismatched expected IDs. Remote temporary SQL files have mode 0600 and are removed; sensitive SQL/error output is suppressed. The operator must review provisioning in an environment where D1 import is available; an existing production administrator needs no new password.

Once bound, legacy `ensureAdmin`/environment startup provisioning can recognize an existing administrator but cannot create/promote another account. Use the authenticated Super Admin API instead. Host/database access is a trusted operator capability, not a regular administrator permission.

The migration and identity binding can be prepared/applied separately from Worker deployment. Full API/frontend enforcement requires deploying the changed code; no automatic code deployment is part of this task. Keep a valid existing password available and sign in again after bootstrap because previous Super Admin sessions are revoked.

## Verification

Node tests cover administrator creation/promotion/demotion/disable/password reset, direct API escalation, reserved registration fields/email, immutable identity/credentials, recent authentication, revoked sessions, new-account bootstrap and authorization changes during hashing. Local Workers/D1 tests exercise the same restrictions and audit/session transaction. Browser tests verify that regular admins cannot see administrator controls and the bound Super Admin can create an administrator.

## Verified state

Production D1 migration `0005_access_control.sql` was applied and the existing account `usr_d34a7a1973194b4e` was bound successfully. Its password was not changed. Binding revoked its prior sessions and recorded `super_admin.bind`. The Worker and frontend code have not been deployed; the new API/UI policy becomes active when this code is deployed.

Validation passed: 89 Node tests, 13 browser end-to-end checks (including restricted controls and Super Admin administrator creation), and 20 local Cloudflare checks including D1 privilege enforcement. Existing cafe/sensor/owner/visualization regressions remain passing.
