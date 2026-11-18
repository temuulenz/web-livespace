// Shared Node/SQLite and Workers/D1 policy: a LiveSpace administrator assigns, changes or
// removes a café's owner account. (Owners are otherwise linked through the partner
// application's one-time claim.) Owner routes check cafes.owner_id on every request, so the
// change takes effect immediately for both the new and the previous owner.
//
// The target must be an existing, enabled account with the `owner` role; promoting an account
// stays in user management (which requires recent authentication). The update rechecks the
// actor and target inside SQL and the immutable user_audit_log row is written only when the
// update happened, in the same transaction / D1 batch.
export function createCafeOwnership({ sql, fail, id, now = () => new Date().toISOString() }) {
  const view = u => u && { id: u.id, email: u.email, name: u.name, role: u.role };
  return {
    async setOwner(actor, cafeId, input) {
      if (!actor || actor.role !== 'admin' || actor.disabled_at) fail(actor ? 403 : 401, 'forbidden', 'Administrator access required');
      if (!input || typeof input !== 'object' || Array.isArray(input) || !('email' in input) || Object.keys(input).some(k => k !== 'email')) fail(422, 'validation_failed', 'Send {"email": "owner@example.com"} or {"email": null}');
      const cafe = await sql.first('SELECT id, owner_id FROM cafes WHERE id=?', cafeId);
      if (!cafe) fail(404, 'not_found', 'Кафе олдсонгүй');
      let owner = null;
      if (input.email !== null) {
        if (typeof input.email !== 'string' || !input.email.trim() || input.email.length > 200) fail(422, 'validation_failed', 'И-мэйл хаяг буруу байна');
        owner = await sql.first('SELECT id, email, name, role, disabled_at FROM users WHERE lower(email)=lower(?)', input.email.trim());
        if (!owner) fail(404, 'user_not_found', 'Ийм и-мэйлтэй бүртгэл олдсонгүй. Эхлээд «Хэрэглэгчид» хэсгээс эзэмшигчийн бүртгэл үүсгэнэ үү.');
        if (owner.disabled_at) fail(409, 'user_disabled', 'Энэ бүртгэл идэвхгүй болсон байна');
        if (owner.role !== 'owner') fail(422, 'owner_role_required', 'Энэ бүртгэл «Кафе эзэмшигч» эрхгүй. «Хэрэглэгчид» хэсгээс эрхийг нь эзэмшигч болгоно уу.');
      }
      const next = owner?.id ?? null, previous = cafe.owner_id ?? null;
      if (next === previous) return { owner: view(owner), changed: false };
      const eventId = id('audit'), at = now();
      await sql.batch([
        [`UPDATE cafes SET owner_id=?, updated_at=? WHERE id=? AND owner_id IS ?
          AND EXISTS(SELECT 1 FROM users a WHERE a.id=? AND a.role='admin' AND a.disabled_at IS NULL)
          AND (? IS NULL OR EXISTS(SELECT 1 FROM users o WHERE o.id=? AND o.role='owner' AND o.disabled_at IS NULL))`,
          next, at, cafe.id, previous, actor.id, next, next],
        ['INSERT INTO user_audit_log(id,actor_id,target_id,action,at,details) SELECT ?,?,?,?,?,? WHERE changes()=1',
          eventId, actor.id, next ?? previous, next ? 'cafe.owner.assign' : 'cafe.owner.remove', at, JSON.stringify({ cafe_id: cafe.id, previous_owner_id: previous, owner_id: next })]
      ]);
      if (!await sql.first('SELECT id FROM user_audit_log WHERE id=?', eventId)) fail(409, 'owner_changed', 'Эзэмшигч эсвэл эрх өөрчлөгдсөн байна. Дахин ачаалаад оролдоно уу.');
      return { owner: view(owner), changed: true };
    }
  };
}
