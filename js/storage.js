const store = { get(k, d) { try { const v = localStorage.getItem('ls_' + k); return v == null ? d : JSON.parse(v) } catch (e) { return d } }, set(k, v) { try { localStorage.setItem('ls_' + k, JSON.stringify(v)) } catch (e) { } } };

export { store };
