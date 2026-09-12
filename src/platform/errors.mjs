/**
 * Platform error type. The coordinator serializes thrown errors to
 * `{error:{code,message},requestId}` and strips private fields; the `status`
 * and `code` values here mirror docs/MODULE-CONTRACT.md.
 */
export class PlatformError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = "PlatformError";
    this.code = code;
    this.status = status;
  }
}

export const invalid = (message) =>
  new PlatformError("invalid_request", message, 400);
export const unauthenticated = (message = "Authentication required") =>
  new PlatformError("unauthenticated", message, 401);
export const forbidden = (message = "Access denied") =>
  new PlatformError("forbidden", message, 403);
export const notFound = (message = "Record not found") =>
  new PlatformError("not_found", message, 404);
export const conflict = (message) => new PlatformError("conflict", message, 409);
export const quota = (message) => new PlatformError("quota", message, 429);
export const unavailable = (message) =>
  new PlatformError("unavailable", message, 503);
