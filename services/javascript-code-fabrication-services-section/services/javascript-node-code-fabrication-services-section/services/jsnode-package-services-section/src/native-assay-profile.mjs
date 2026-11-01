/** A native fixture is trusted host composition, never executable work-order data.
 * The profile names its source and native contract. Its content identity binds
 * that declaration; it does not authenticate the source or grant capabilities.
 */
import { semanticId } from "@red-cup-engineering/computer-content-address-engineering-services-section/semiotic-content-address";
import { schemaFromGraph } from "@red-cup-engineering/json-schema-services-section/contracts";
import { sha256Digest } from "@red-cup-engineering/cryptographic-computer-data-engineering-services-section/integrity";
import { confined } from "./project-jsnode-module-paths.mjs";
import moduleSchema from "../data/records/schema/jsnode-module-specification.schema.json" with { type: "json" };

const profileSchema = moduleSchema.properties.operations.items.properties.nativeProfile;
const profiles = new WeakMap();
const plain = value => Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null;

/** Snapshot source-free data without invoking getters or losing native values. */
export function nativeAssayData(value) {
  let entries = 0;
  const copy = (item, depth) => {
    if (++entries > 16384 || depth > 64) throw new TypeError("native assay data exceeds its structural bound");
    if (item === null || typeof item === "string" || typeof item === "boolean") return item;
    if (typeof item === "number" && Number.isFinite(item)) return item;
    if (typeof item !== "object" || (!Array.isArray(item) && !plain(item)))
      throw new TypeError("native assay data must be plain JSON data, not native capabilities or values");
    const descriptors = Object.getOwnPropertyDescriptors(item), keys = Reflect.ownKeys(descriptors);
    if (keys.some(key => typeof key !== "string" || !("value" in descriptors[key])))
      throw new TypeError("native assay data cannot contain symbols or accessors");
    if (Array.isArray(item)) {
      if (keys.length !== item.length + 1 || keys.some(key => key !== "length" && !/^(?:0|[1-9][0-9]*)$/u.test(key)))
        throw new TypeError("native assay data cannot contain sparse or extended arrays");
      return Object.freeze(Array.from({ length: item.length }, (_, index) => copy(descriptors[index].value, depth + 1)));
    }
    return Object.freeze(Object.fromEntries(keys.map(key => [key, copy(descriptors[key].value, depth + 1)])));
  };
  const result = copy(value, 0);
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > 256 * 1024)
    throw new TypeError("native assay data exceeds its byte bound");
  return result;
}

/** Admit one bounded declarative native contract without acquiring a fixture. */
export function admitNativeAssayProfile(profile) {
  const value = nativeAssayData(profile), id = "urn:561:jsnode-native-assay-profile";
  schemaFromGraph({ root: id, schemas: [{ id, schema: { $id: id, ...profileSchema } }] }).assert(value);
  if (value.sourceClosure !== undefined) {
    const { identity, ...declaration } = value.sourceClosure;
    if (identity !== semanticId(declaration)) throw new TypeError("native source closure identity differs from its declaration");
    const paths = new Set();
    for (const file of declaration.files) {
      sourcePath(file.path);
      if (paths.has(file.path)) throw new TypeError("duplicate native source closure path");
      paths.add(file.path);
    }
  }
  return value;
}

function sourcePath(path) {
  confined(path, "src");
  if (!path.endsWith(".mjs") || path.split("/").includes("node_modules"))
    throw new TypeError("native retained sources must be confined original ESM modules");
}

function heldSourceFiles(files) {
  if (!Array.isArray(files) || files.length > 128) throw new TypeError("native retained sources require a bounded host array");
  const paths = new Set(), held = [];
  let bytes = 0;
  for (let index = 0; index < files.length; index++) {
    const entry = Object.getOwnPropertyDescriptor(files, index);
    if (!entry || !("value" in entry) || entry.value === null || typeof entry.value !== "object" || !plain(entry.value))
      throw new TypeError("native retained sources must be plain host records");
    const fields = Object.getOwnPropertyDescriptors(entry.value);
    if (Reflect.ownKeys(fields).length !== 3 || !["path", "text", "source"].every(key => fields[key] && "value" in fields[key]))
      throw new TypeError("native retained sources need only path, text and source data");
    const path = fields.path.value, text = fields.text.value, source = nativeAssayData(fields.source.value);
    sourcePath(path);
    if (paths.has(path)) throw new TypeError("duplicate native retained source path");
    paths.add(path);
    if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > 1024 * 1024)
      throw new TypeError("native retained source text exceeds its bound");
    bytes += Buffer.byteLength(text, "utf8");
    if (bytes > 4 * 1024 * 1024) throw new TypeError("native retained source closure exceeds its byte bound");
    if (Object.keys(source).sort().join(",") !== "digest,locator" || typeof source.locator !== "string" || !source.locator || source.locator.length > 2048
      || source.digest !== sha256Digest(text)) throw new TypeError("native retained source bytes differ from their source identity");
    held.push(Object.freeze({ path, text, source }));
  }
  return Object.freeze(held.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}

/** Declare exact existing source paths and identities without carrying their
 * executable bytes into a source-free work order. No source is generated here.
 */
export function nativeAssaySourceClosure(sourceFiles) {
  const files = heldSourceFiles(sourceFiles);
  if (!files.length) throw new TypeError("a native source closure must retain at least one original module");
  const declaration = Object.freeze({ type: "JsnodeNativeSourceClosure", version: 1, readOnly: true,
    files: Object.freeze(files.map(({ path, source }) => Object.freeze({ path, source }))) });
  return Object.freeze({ ...declaration, identity: semanticId(declaration) });
}

/** The existing content-address owner identifies the complete native contract. */
export function nativeAssayProfileIdentity(profile) {
  return semanticId(admitNativeAssayProfile(profile));
}

/** Bind an already trusted fixture projector in-process. The executable port is
 * held privately; copying/serializing the returned declaration loses the port.
 * project receives immutable scenario data and returns one bounded test source.
 */
export function bindNativeAssayProfile(profile, project, { sourceFiles = [] } = {}) {
  if (typeof project !== "function") throw new TypeError("a native assay projection function must be supplied by the host");
  const admitted = admitNativeAssayProfile(profile);
  const held = heldSourceFiles(sourceFiles);
  if (held.length ? admitted.sourceClosure === undefined || semanticId(nativeAssaySourceClosure(held)) !== semanticId(admitted.sourceClosure)
    : admitted.sourceClosure !== undefined) throw new TypeError("native source closure binding does not match its declared original sources");
  const binding = Object.freeze({ profile: admitted, identity: semanticId(admitted) });
  profiles.set(binding, Object.freeze({ project, sourceFiles: held }));
  return binding;
}

/** Snapshot the native capability selection before inference or any await. */
export function nativeBindingsFor(closure, supplied = []) {
  if (!Array.isArray(supplied) || supplied.length > 128) throw new TypeError("native assay bindings must be a bounded host array");
  const identities = new Set(), bindings = [];
  for (let index = 0; index < supplied.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(supplied, index);
    if (!descriptor || !("value" in descriptor) || !profiles.has(descriptor.value))
      throw new TypeError("native assay binding was not established by the trusted host constructor");
    const binding = descriptor.value;
    if (identities.has(binding.identity)) throw new TypeError("duplicate native assay binding");
    identities.add(binding.identity);bindings.push(binding);
  }
  for (const operation of closure.operations) if (operation.nativeProfile !== undefined) {
    const identity = nativeAssayProfileIdentity(operation.nativeProfile);
    if (!identities.has(identity)) throw new TypeError(`native assay binding unavailable for ${operation.name}: ${identity}`);
  }
  retainedNativeSources(closure, bindings);
  return Object.freeze(bindings);
}

/** Retain only source closures selected by this order. Generated target paths
 * are disjoint; two profiles cannot supply different originals at one path.
 */
export function retainedNativeSources(closure, bindings) {
  const generated = new Set(closure.operations.map(operation => operation.module)), held = new Map();
  const wanted = new Set(closure.operations.filter(operation => operation.nativeProfile !== undefined)
    .map(operation => nativeAssayProfileIdentity(operation.nativeProfile)));
  for (const binding of bindings) if (wanted.has(binding.identity)) {
    const sources = profiles.get(binding)?.sourceFiles;
    if (!sources) throw new TypeError("native source closure has no trusted host binding");
    for (const file of sources) {
      if (generated.has(file.path)) throw new TypeError("generated target would overwrite a retained original source");
      const prior = held.get(file.path);
      if (prior && (prior.text !== file.text || semanticId(prior.source) !== semanticId(file.source)))
        throw new TypeError("native source closures disagree about one retained original");
      held.set(file.path, file);
    }
  }
  return Object.freeze([...held.values()]);
}

/** Project a single fixed-path test lot through the already bound host port.
 * All names remain subject to the existing independent TAP completion check.
 */
export function projectNativeAssays(operation, cases, bindings) {
  const profile = admitNativeAssayProfile(operation.nativeProfile), identity = semanticId(profile);
  const binding = bindings.find(item => item.identity === identity && profiles.has(item));
  if (!binding) throw new TypeError(`native assay binding unavailable for ${operation.name}`);
  const request = nativeAssayData({ operation, profile, identity, cases });
  const text = profiles.get(binding).project(request);
  if (typeof text !== "string" || text.trim() === "" || Buffer.byteLength(text, "utf8") > 1024 * 1024)
    throw new TypeError("native assay projection must synchronously return one bounded test source");
  return text;
}
