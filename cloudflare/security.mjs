// Match the existing Node backend policy for both API and Static Assets.
export const securityHeaders = {
 'X-Content-Type-Options':'nosniff',
 'Referrer-Policy':'same-origin',
 'X-Frame-Options':'SAMEORIGIN',
 'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
 'Content-Security-Policy':"default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'"
};
