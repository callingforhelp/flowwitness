// Self-contained error primitives for the knowledge module. The module must
// import and run without the server, platform, or sibling modules, so it keeps
// its own copies instead of importing shared sources that may move.
export class Fault extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "Fault";
    this.code = code;
    this.status = status;
  }
}
export function demand(ok, message, code = "invalid_request", status = 400) {
  if (!ok) throw new Fault(code, message, status);
}
