# Transform JSON Schema to TypeScript Service

Purely transforms a JSON Schema literal into TypeScript source. It supports
`const`, `enum`, `anyOf`, `oneOf`, object properties and required keys, arrays
(including tuple `items`), primitive `type` values, and local `#/$defs` refs.
It neither reads files nor validates values.

```js
import { transformJsonSchemaToTypescript } from "@red-cup-engineering/transform-json-schema-to-typescript-service";

const source = transformJsonSchemaToTypescript(
  { title: "Message", type: "object", required: ["body"], properties: { body: { type: "string" } } },
);
// export type Message = { readonly "body": string; };
```

`./types` provides `FromJsonSchema<S>` for TypeScript code that needs the
equivalent type-level reading of an `as const` schema literal.
