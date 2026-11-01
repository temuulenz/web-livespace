// Central error handling.
//
// Components catch their own render and handler errors and pass them here, so one
// broken widget shows a small message instead of taking the page down. The app
// decides how errors are reported and what the fallback markup says.

import { escapeHTML } from '../renderer/html.js';

const config = {
  onError: (error, context) => console.error(context ? `[${context}]` : '', error),
  render: message => `<div role="alert" class="fw-error">${escapeHTML(message)}</div>`,
  message: 'Something went wrong.'
};

export function configureErrors(options) { Object.assign(config, options); }

export function handleError(error, context) {
  try { config.onError(error, context); } catch { /* never throw from the error path */ }
}

export const errorView = (message = config.message) => config.render(message);

// Capture errors that escape everything else (uncaught exceptions, rejected promises).
export function installGlobalErrorHandler(target = window) {
  const onError = event => handleError(event.error || event.message, 'window');
  const onRejection = event => handleError(event.reason, 'promise');
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => { target.removeEventListener('error', onError); target.removeEventListener('unhandledrejection', onRejection); };
}
