// Match the existing Node backend policy for both API and Static Assets.
export const securityHeaders = {
 'X-Content-Type-Options':'nosniff',
 'Referrer-Policy':'same-origin',
 'X-Frame-Options':'SAMEORIGIN',
 'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
 'Content-Security-Policy':"default-src 'self'; img-src 'self' data: blob: https://tiles.openfreemap.org; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com; font-src https://fonts.gstatic.com; script-src 'self' https://unpkg.com; worker-src 'self' blob:; connect-src 'self' https://tiles.openfreemap.org; frame-ancestors 'self'; base-uri 'self'; form-action 'self'"
};
