/** A complete 6-digit authenticator code — or, when allowed, an `XXXX-XXXX` recovery code. */
export const isOtpComplete = (v: string, allowRecovery = false) =>
  /^\d{6}$/.test(v) || (allowRecovery && /^[A-Z0-9]{4}-?[A-Z0-9]{4}$/.test(v));
