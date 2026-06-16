// CommonJS require hook — intercepts the "server-only" import and resolves
// it to a noop module so server-only-guarded lib code can run in CLI scripts.
// Also loads .env.local so lib/db.ts has DATABASE_URL at module-init time
// (which happens before any user-script code runs).
// Loaded via: NODE_OPTIONS='--require ./scripts/_server-only-stub.cjs' npx tsx ...
require("dotenv").config({ path: ".env.local" });

const Module = require("module");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "server-only") {
    return require.resolve("path"); // any builtin noop
  }
  return origResolve.call(this, request, ...rest);
};
