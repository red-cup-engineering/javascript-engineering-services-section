import http from "node:http";

/** Probes the local registry the staged-installation tests install from; resolves true only when it answers. */
export async function localRegistryAvailable(url = "http://127.0.0.1:4873/") {
  return await new Promise((resolve) => {
    const request = http.get(url, { timeout: 1500 }, (response) => { response.resume(); resolve(true); });
    request.on("timeout", () => { request.destroy(); resolve(false); });
    request.on("error", () => resolve(false));
  });
}

export const hasLocalRegistry = await localRegistryAvailable();
/** The test option that skips a test needing the local registry, with the declared reason. */
export const requiresLocalRegistry = hasLocalRegistry ? {} : { skip: "requires a local registry at http://127.0.0.1:4873/ (staged dependency installation)" };
