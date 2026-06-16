// ESM loader hook — intercepts the "server-only" import and resolves it
// to a noop module so server-only-guarded lib code can run in CLI scripts.
// Loaded via: node --import ./scripts/_server-only-stub.mjs --import tsx ...
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(
  new URL(
    "data:text/javascript," +
      encodeURIComponent(
        `
        export async function resolve(specifier, context, nextResolve) {
          if (specifier === 'server-only') {
            return { url: 'data:text/javascript,export{}', shortCircuit: true };
          }
          return nextResolve(specifier, context);
        }
      `.trim(),
      ),
  ),
  pathToFileURL("./"),
);
