/** The same agency layout applies to every services section. */
import path from "node:path";
import { lstatSync, readdirSync, realpathSync } from "node:fs";
import layout from "../data/records/schemas/agency-layout.json" with {type:"json"};
const agencyDirectory=layout.directory, recordPatterns=Object.freeze({...layout.records});
export const AGENCY_POOLS = Object.freeze([...layout.pools]);
const safeSection = value => typeof value === "string" && (value === "" || (!value.startsWith("/")
  && !/[\\\u0000-\u001f\u007f]/u.test(value) && value.split("/").every(p => p && p !== "." && p !== "..")));
const excluded = new Set(["data", "node_modules", ".git", "vendor", "legacy", "_archive", "dist", ".cache", ".tmp", "coverage"]);
/** Admit an explicit host's confined source selection without loading a host. */
export function admitAgencySections(value) {
  if (!Array.isArray(value) || value.some(section => !safeSection(section)))
    throw new TypeError("Enterprise host agency sections must be an array of confined source-relative section paths");
  return Object.freeze([...new Set(value)].sort());
}
const directory = file => {
  try { return lstatSync(file).isDirectory() && realpathSync(file) === file; }
  catch (error) { if (error.code === "ENOENT" || error.code === "ENOTDIR") return false; throw error; }
};

/** Observe only the section topology, never a section's contents. Additional
 * source roots are explicit app/library owners, not directory-name aliases.
 * Empty owners remain selected so their first act-log record can be received
 * without creating source directories. No snapshots, dependencies or links enter. */
export function agencySourceSections(root, { sourceRoots = [""] } = {}) {
  if (typeof root !== "string" || !path.isAbsolute(root) || path.resolve(root) !== root || !directory(root))
    throw new TypeError("absolute canonical agency root required");
  if (!Array.isArray(sourceRoots) || sourceRoots.some(section => !safeSection(section)
    || section.split("/").some(part => excluded.has(part)))) throw new TypeError("exact source section roots required");
  const found = new Set(), visited = new Set();
  const visit = section => {
    if (visited.has(section)) return;
    visited.add(section);
    const at = path.join(root, section);
    if (!directory(at)) return;
    found.add(section);
    const children = path.join(at, "services");
    if (!directory(children)) return;
    for (const entry of readdirSync(children, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory() || excluded.has(entry.name) || entry.name.startsWith(".") || !safeSection(entry.name)) continue;
      visit([section, "services", entry.name].filter(Boolean).join("/"));
    }
  };
  for (const section of sourceRoots) {
    let at = root;
    for (const part of section.split("/").filter(Boolean)) {
      at = path.join(at, part);
      if (!directory(at)) throw new TypeError("source section root is absent or redirected");
    }
    found.add(section);
    visit(section);
  }
  return Object.freeze([...found].sort());
}
export function agencySectionPools(root, sections = [""]) {
  if (typeof root !== "string" || !path.isAbsolute(root) || path.resolve(root) !== root) throw new TypeError("absolute normalized agency root required");
  if (!Array.isArray(sections) || sections.some(s => !safeSection(s))) throw new TypeError("exact section paths required");
  return Object.freeze([...new Set(sections)].flatMap(sectionPath => AGENCY_POOLS.map(pool => {
    const sourcePrefix = [sectionPath, agencyDirectory, pool].filter(Boolean).join("/");
    return Object.freeze({pool, section:path.basename(sectionPath || root), sectionPath, dir:path.join(root,sourcePrefix), sourcePrefix});
  })));
}
export function agencyRecordSource(pool, id, section = "") {
  if (!AGENCY_POOLS.includes(pool) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id) || !safeSection(section)) throw new TypeError("invalid agency record address");
  const record = (recordPatterns[pool] ?? recordPatterns.default).replace("{id}",id);
  return [section,agencyDirectory,pool,record].filter(Boolean).join("/");
}


/** Judge paths from the section reader's explicit entries; never walk a corpus. */
export function agencyPathReading(entries) {
  const files=entries.filter(file=>!file.endsWith("/")),prefix=agencyDirectory+"/";
  const records=[],resources=[],obstructions=[],pools=new Set();
  for(const file of files){
    if(!file.startsWith(prefix))continue;
    const [pool,...parts]=file.slice(prefix.length).split("/");
    if(parts.length===0 && /^(README|index)\.md$/iu.test(pool))continue;
    if(!AGENCY_POOLS.includes(pool)){obstructions.push({file,reason:"unknown agency pool"});continue;}
    pools.add(pool);
    const id=parts[0]?.replace(/\.json$/u,"");
    if(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id??"") && file===agencyRecordSource(pool,id)) {records.push({pool,id,file});continue;}
    if(pool==="skills"&&parts.length>1 && files.includes(agencyRecordSource(pool,parts[0])) && parts[1]!=="skill.json") {resources.push(file);continue;}
    if(pool!=="skills"&&parts.length>1 && files.includes(agencyRecordSource(pool,parts[0]))) {resources.push(file);continue;}
    if(parts.length===1&&/^(README|index)\.md$/iu.test(parts[0])){resources.push(file);continue;}
    obstructions.push({file,reason:"nonconformant agency carrier"});
  }
  return Object.freeze({present:pools.size>0,pools:Object.freeze([...pools].sort()),records:Object.freeze(records),resources:Object.freeze(resources),obstructions:Object.freeze(obstructions)});
}
