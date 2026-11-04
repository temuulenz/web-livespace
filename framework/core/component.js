// Components.
//
//   class Counter extends Component {
//     initialState() { return { n: 0 }; }
//     events() { return { 'click [data-inc]': () => this.setState({ n: this.state.n + 1 }) }; }
//     render() { return html`<button data-inc>${this.state.n}</button>`; }
//   }
//   const counter = mount(Counter, element, props);
//   counter.destroy();
//
// Lifecycle: constructor → mount(el) → render → onMount → (setState → render → onUpdate)* → destroy → onDestroy
//
// Everything a component starts through its helpers (listen, timeout, interval, frame,
// watch, child) is released by destroy(), so navigating away never leaves a listener,
// timer or animation frame behind. Re-renders are batched per microtask and patched
// into the existing DOM (see renderer/patch.js) rather than replacing it.

import { patch } from '../renderer/patch.js';
import { delegate } from '../events/bus.js';
import { handleError, errorView } from './errors.js';

export class Component {
  constructor(props = {}) {
    this.props = props;
    this.state = this.initialState(props) || {};
    this.el = null;
    this.mounted = false;
    this._abort = null;
    this._cleanups = new Set();
    this._scheduled = false;
  }

  // ---- overridable hooks ----
  initialState() { return {}; }
  render() { return ''; }
  events() { return {}; }
  onMount() { }
  onUpdate() { }
  onDestroy() { }

  // ---- lifecycle ----
  mount(el) {
    if (this.mounted) throw new Error('Component is already mounted');
    this.el = el;
    this._abort = new AbortController();
    this.mounted = true;
    this._render();
    for (const [spec, handler] of Object.entries(this.events() || {})) {
      const space = spec.indexOf(' ');
      const type = space < 0 ? spec : spec.slice(0, space), selector = space < 0 ? null : spec.slice(space + 1).trim();
      const fn = typeof handler === 'string' ? this[handler] : handler;
      const safe = (event, target) => { try { fn.call(this, event, target); } catch (error) { handleError(error, this.constructor.name); } };
      if (selector) delegate(el, type, selector, safe, { signal: this._abort.signal });
      else el.addEventListener(type, event => safe(event, el), { signal: this._abort.signal });
    }
    this._safely(() => this.onMount());
    return this;
  }

  setState(patchOrFn) {
    const next = typeof patchOrFn === 'function' ? patchOrFn(this.state) : patchOrFn;
    if (!next) return;
    this.state = { ...this.state, ...next };
    this.invalidate();
  }

  setProps(props) { this.props = { ...this.props, ...props }; this.invalidate(); }

  // Schedule one re-render for all changes made in the current task.
  invalidate() {
    if (!this.mounted || this._scheduled) return;
    this._scheduled = true;
    queueMicrotask(() => {
      this._scheduled = false;
      if (!this.mounted) return;
      this._render();
      this._safely(() => this.onUpdate());
    });
  }

  destroy() {
    if (!this.mounted) return;
    this.mounted = false;
    this._abort.abort();
    for (const cleanup of [...this._cleanups]) this._safely(cleanup);
    this._cleanups.clear();
    this._safely(() => this.onDestroy());
  }

  // ---- resource helpers (all released on destroy) ----
  listen(target, type, handler, options = {}) {
    target.addEventListener(type, handler, { ...options, signal: this._abort.signal });
  }
  timeout(fn, ms) { const id = setTimeout(() => { this._cleanups.delete(stop); this._safely(fn); }, ms); const stop = () => clearTimeout(id); this._cleanups.add(stop); return stop; }
  interval(fn, ms) { const id = setInterval(() => this._safely(fn), ms); const stop = () => clearInterval(id); this._cleanups.add(stop); return () => { stop(); this._cleanups.delete(stop); }; }
  frame(fn) { const id = requestAnimationFrame(t => { this._cleanups.delete(stop); this._safely(() => fn(t)); }); const stop = () => cancelAnimationFrame(id); this._cleanups.add(stop); return stop; }
  watch(store, select, callback) { const off = store.subscribe(select, (...args) => this._safely(() => callback(...args))); this._cleanups.add(off); return off; }
  onCleanup(fn) { this._cleanups.add(fn); return fn; }
  child(ComponentClass, el, props) { const instance = new ComponentClass(props); instance.mount(el); this._cleanups.add(() => instance.destroy()); return instance; }

  // Query inside this component only.
  $(selector) { return this.el.querySelector(selector); }
  $$(selector) { return [...this.el.querySelectorAll(selector)]; }

  _render() {
    try { patch(this.el, this.render()); }
    catch (error) { handleError(error, this.constructor.name); this.el.innerHTML = errorView(); }
  }
  _safely(fn) { try { return fn(); } catch (error) { handleError(error, this.constructor.name); } }
}

export function mount(ComponentClass, el, props) {
  return new ComponentClass(props).mount(el);
}
