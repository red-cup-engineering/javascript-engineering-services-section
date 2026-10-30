// @red-cup-engineering/hai-rui
//
// A domain presented as witnessed predication: vocabulary enters as marks,
// facts enter as witnesses, computation is induce() plus readings.
// Judgments return witness-or-obstruction carriers, never booleans, never
// domain-outcome throws. Evidence is monotone. Kind strings are morphism
// paths (Three Dots and a Dash: "." generated-from, ":" witnesses,
// "-" obstructs). See dev/docs/explanations/package-invariants.md.

import type { App } from "@red-cup-engineering/http-server";
import { htmlRepr, jsonRepr } from "@red-cup-engineering/http-server";
import { render } from "@red-cup-engineering/organizing-with-the-web/theming";
import { haiRuiTheme } from "./theme.ts";

export type HaiRuiCarrier = Readonly<{
  kind: "hai-rui";
}>;

export function haiRui(): HaiRuiCarrier {
  return Object.freeze({ kind: "hai-rui" });
}

/** The hai-rui App: the inference/advice layer's surfaces. A request handler,
 *  not a daemon — operations-manifold mounts it. Links it owns are relative to its mount. */
export function createApp(): App {
  return {
    resources: [
      {
        match: "/health",
        methods: ["GET"],
        produces: ["application/json"],
        handler: () => jsonRepr({ status: "ok", layer: "infer" }),
      },
      {
        match: "/",
        methods: ["GET"],
        produces: ["text/html"],
        handler: () =>
          htmlRepr(
            render(
              haiRuiTheme,
              `<h1>hai-rui</h1>
<p>Inference and advice layer. Queries <a href="https://conformance-tics.561.group/">conformance-tics</a>
for audit findings and surfaces derived recommendations.</p>
<p>Implementation pending: the inference layer requires the witness→audit→infer pipeline to be wired.</p>`,
              { title: "hai-rui — inference layer", siteName: "hai-rui", lang: "en" },
            ),
          ),
      },
    ],
  };
}

// Apps render; services settle; sites operate. Domain logic lives in lib/.
