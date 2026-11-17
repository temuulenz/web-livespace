import assert from 'node:assert/strict';
import test from 'node:test';
import { ADMIN, startServer } from './support/server.mjs';
import { createCafeOwnership } from '../server/services/cafe-ownership.mjs';
import { transaction } from '../server/lib/db.mjs';

const PASSWORD = 'a-test-password-123';

test('admins assign, change and remove a café owner; access follows immediately and every change is audited', async () => {
  const server = await startServer(), db = server.app.deps.db;
  try {
    const admin = server.client(); await admin.post('/api/v1/auth/login', ADMIN);
    const make = async (email, role) => (await admin.post('/api/v1/admin/users', { email, password: PASSWORD, role })).data.user;
    const owner1 = await make('owner1@test.mn', 'owner'), owner2 = await make('owner2@test.mn', 'owner'), plain = await make('plain@test.mn', 'user');
    const login = async email => { const c = server.client(); await c.post('/api/v1/auth/login', { email, password: PASSWORD }); return c; };
    const o1 = await login(owner1.email), o2 = await login(owner2.email), user = await login(plain.email), guest = server.client();
    const owns = async client => (await client.get('/api/v1/owner/cafes')).data.cafes.map(c => c.id);
    const put = (client, body, cafe = 'A') => client.put(`/api/v1/admin/cafes/${cafe}/owner`, body);

    // Only administrators may change ownership.
    assert.equal((await put(guest, { email: owner1.email })).status, 401);
    assert.equal((await put(user, { email: owner1.email })).status, 403);
    assert.equal((await put(o1, { email: owner1.email })).status, 403);

    // Strict input: one field, an existing enabled owner account, an existing café.
    for (const body of [{}, { email: owner1.email, owner_id: owner1.id }, { email: 5 }, { email: '' }]) assert.equal((await put(admin, body)).status, 422, JSON.stringify(body));
    assert.equal((await put(admin, { email: 'nobody@test.mn' })).data.error.code, 'user_not_found');
    assert.equal((await put(admin, { email: plain.email })).data.error.code, 'owner_role_required');
    assert.equal((await put(admin, { email: ADMIN.email })).data.error.code, 'owner_role_required');
    assert.equal((await put(admin, { email: owner1.email }, 'NO-SUCH-CAFE')).status, 404);

    // Assign (case-insensitive e-mail) → the owner's dashboard shows the café at once.
    assert.deepEqual(await owns(o1), []);
    let res = await put(admin, { email: 'OWNER1@test.mn' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.data, { owner: { id: owner1.id, email: owner1.email, name: owner1.name, role: 'owner' }, changed: true });
    assert.deepEqual(await owns(o1), ['A']);
    assert.equal((await admin.get('/api/v1/admin/cafes/A')).data.cafe.owner.email, owner1.email);
    assert.equal((await put(admin, { email: owner1.email })).data.changed, false, 'repeat is a no-op');

    // Change → the previous owner loses access immediately; remove → nobody owns it.
    assert.equal((await put(admin, { email: owner2.email })).data.changed, true);
    assert.deepEqual([await owns(o1), await owns(o2)], [[], ['A']]);
    assert.equal((await o1.patch('/api/v1/owner/cafes/A', { phone: '99112233' })).status, 404);
    res = await put(admin, { email: null });
    assert.deepEqual(res.data, { owner: null, changed: true });
    assert.deepEqual(await owns(o2), []);
    assert.equal(db.prepare("SELECT owner_id FROM cafes WHERE id='A'").get().owner_id, null);
    assert.equal((await put(admin, { email: null })).data.changed, false);

    // Disabled owner accounts cannot be assigned.
    assert.equal((await admin.patch(`/api/v1/admin/users/${owner2.id}`, { disabled: true })).status, 200);
    assert.equal((await put(admin, { email: owner2.email })).data.error.code, 'user_disabled');

    // Immutable audit trail: exactly the three real changes, with café and previous owner.
    const audit = db.prepare("SELECT actor_id, target_id, action, details FROM user_audit_log WHERE action LIKE 'cafe.owner.%' ORDER BY at, rowid").all();
    const adminId = db.prepare('SELECT id FROM users WHERE email=?').get(ADMIN.email).id;
    assert.deepEqual(audit.map(a => [a.actor_id, a.target_id, a.action, JSON.parse(a.details)]), [
      [adminId, owner1.id, 'cafe.owner.assign', { cafe_id: 'A', previous_owner_id: null, owner_id: owner1.id }],
      [adminId, owner2.id, 'cafe.owner.assign', { cafe_id: 'A', previous_owner_id: owner1.id, owner_id: owner2.id }],
      [adminId, owner2.id, 'cafe.owner.remove', { cafe_id: 'A', previous_owner_id: owner2.id, owner_id: null }]
    ]);
    assert.throws(() => db.prepare("DELETE FROM user_audit_log WHERE action='cafe.owner.assign'").run(), /audit_immutable/);
  } finally { await server.stop(); }
});

test('ownership changes recheck the actor, the target and the current owner inside the write', async () => {
  const server = await startServer(), db = server.app.deps.db;
  try {
    const admin = server.client(); await admin.post('/api/v1/auth/login', ADMIN);
    const owner = (await admin.post('/api/v1/admin/users', { email: 'race@test.mn', password: PASSWORD, role: 'owner' })).data.user;
    const actor = db.prepare('SELECT * FROM users WHERE email=?').get(ADMIN.email);
    const fail = (status, code) => { throw Object.assign(new Error(code), { status, code }); };
    const real = { first: async (q, ...a) => db.prepare(q).get(...a), batch: async entries => transaction(db, () => entries.forEach(([q, ...a]) => db.prepare(q).run(...a))) };
    let n = 0; const id = p => `${p}-race-${++n}`;
    // The policy read sees an owner, but the account is demoted before the write.
    const demoteFirst = { ...real, batch: async entries => { db.prepare("UPDATE users SET role='user' WHERE id=?").run(owner.id); return real.batch(entries); } };
    await assert.rejects(createCafeOwnership({ sql: demoteFirst, fail, id }).setOwner(actor, 'A', { email: owner.email }), { code: 'owner_changed' });
    db.prepare("UPDATE users SET role='owner' WHERE id=?").run(owner.id);
    // Someone else changed the café's owner in between.
    const raceOwner = { ...real, batch: async entries => { db.prepare("UPDATE cafes SET owner_id=? WHERE id='A'").run(owner.id); db.prepare("UPDATE cafes SET owner_id=NULL WHERE id='A'").run(); db.prepare("UPDATE cafes SET owner_id=? WHERE id='A'").run(owner.id); return real.batch(entries); } };
    await assert.rejects(createCafeOwnership({ sql: raceOwner, fail, id }).setOwner(actor, 'A', { email: owner.email }), { code: 'owner_changed' });
    // The administrator lost the role before the write.
    db.prepare("UPDATE cafes SET owner_id=NULL WHERE id='A'").run();
    const demoteActor = { ...real, batch: async entries => { db.prepare("UPDATE users SET role='user' WHERE id=?").run(actor.id); return real.batch(entries); } };
    await assert.rejects(createCafeOwnership({ sql: demoteActor, fail, id }).setOwner(actor, 'A', { email: owner.email }), { code: 'owner_changed' });
    assert.equal(db.prepare("SELECT owner_id FROM cafes WHERE id='A'").get().owner_id, null);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM user_audit_log WHERE action LIKE 'cafe.owner.%'").get().n, 0);
  } finally { await server.stop(); }
});
