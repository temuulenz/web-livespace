// LiveSpace framework — public entry point.
// Native browser APIs only; no runtime dependencies. See docs/FRAMEWORK.md.

export { Component, mount } from './core/component.js';
export { configureErrors, handleError, errorView, installGlobalErrorHandler } from './core/errors.js';
export { html, raw, attrs, escapeHTML, SafeHTML } from './renderer/html.js';
export { patch, morphChildren } from './renderer/patch.js';
export { createStore } from './state/store.js';
export { createEventBus, delegate } from './events/bus.js';
export { createRouter, parseHash } from './router/router.js';
export { createApiClient, ApiError } from './api/client.js';
export { createLiveChannel } from './api/realtime.js';
export { createSession } from './auth/session.js';
export { readForm, validate, required, email, minLength, maxLength, pattern, range, count } from './utilities/forms.js';
export { clockTime, dateTime, ageSeconds, bytes } from './utilities/format.js';
