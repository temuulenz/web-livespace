// Authentication session backed by an HTTP-only cookie on the server.
//
//   const session = createSession({ api, endpoints: { me: '/auth/me', login: '/auth/login', logout: '/auth/logout' } });
//   await session.load();
//   session.store.subscribe(s => s.user, user => …);
//   session.hasRole('admin');
//
// The browser never sees the session token; the client only keeps the current user.
// "Pending actions" let a page ask for login and then continue what the user was doing:
//   session.requireLogin(() => saveFavorite(id));   // runs now, or after a successful login

import { createStore } from '../state/store.js';

export function createSession({ api, endpoints = {}, onLoginRequired } = {}) {
  const urls = { me: '/auth/me', login: '/auth/login', logout: '/auth/logout', register: '/auth/register', ...endpoints };
  const store = createStore({ user: null, ready: false });
  let pending = null;

  const accept = user => { store.set({ user: user || null, ready: true }); return user; };

  async function afterLogin(user) {
    accept(user);
    const action = pending; pending = null;
    if (action) await action(user);
    return user;
  }

  return {
    store,
    get user() { return store.get().user; },
    hasRole: (...roles) => !!store.get().user && roles.includes(store.get().user.role),
    async load() {
      try { const data = await api.get(urls.me); return accept(data?.user); }
      catch (error) { accept(null); if (!error.isUnauthorized) throw error; return null; }
    },
    async login(credentials) { const data = await api.post(urls.login, credentials); return afterLogin(data.user); },
    async register(details, url = urls.register) { const data = await api.post(url, details); return afterLogin(data.user); },
    async logout() { try { await api.post(urls.logout); } finally { pending = null; accept(null); } },
    // Called by the API client on 401 so an expired session is reflected everywhere.
    expire() { if (store.get().user) accept(null); },
    requireLogin(action, reason) {
      if (store.get().user) return action(store.get().user);
      pending = action;
      onLoginRequired?.(reason);
      return null;
    },
    cancelPending() { pending = null; }
  };
}
