import {foldDirectoryEntriesIntoServicesSectionForm} from "../scripts/fold-directory-entries-into-services-section-form.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { checkServicesSectionFormConformance as boundOperation } from "../scripts/check-services-section-form-conformance.mjs";
import { law } from "./section-law-fixture.mjs";
const checkServicesSectionFormConformance = (form) => boundOperation(form, law.schema);

const conformantEngineeringForm = {
  type: "ServicesSectionForm",
  version: 1,
  path: "services/engineering-services-section/services/widget-engineering-services-section",
  name: "widget-engineering-services-section",
  custody: "engineering",
  readme: { present: true },
  package: { present: true, name: "@red-cup-engineering/widget", version: "0.1.0", type: "module", dependenciesExactPins: true },
  content: {
    present: false,
    text: {
      glossary: { terms: 0, concepts: 0, topics: 0 },
      documents: { articles: { notes: 0, teachingArticles: { explanations: 0, guides: 0, references: 0, tutorials: 0 }, specifications: 0, bibliographies: 0, researchArticles: 0 } },
    },
  },
  code: { src: ["x.mjs"], scripts: ["read-x.mjs"], apps: [], test: ["x.test.mjs"] },
  data: { present: true, logs: false, records: true, state: false, other: [] },
  agency: {present:false,pools:[],records:[],resources:[],obstructions:[]},
  services: ["child-services-section"],
  legacy: [],
  stray: [],
  laws: {
    uniformAgency:true, dataTrioOnly: true, scriptsVerbNounNaming: true, appsComposeScripts: true, oneTopicPerSection: true,
    contentUnderContentText: true, notesDatedPath: true, noRootWorkspaceFiles: true, legacyIsRevivalInventory: true,
  },
};

const conformantThinPublicForm = {
  type: "ServicesSectionForm",
  version: 1,
  path: "services/public-services-section/services/thin-public-services-section",
  name: "thin-public-services-section",
  custody: "public",
  readme: { present: false },
  package: { present: false },
  content: {
    present: true,
    text: {
      glossary: { terms: 1, concepts: 0, topics: 0 },
      documents: { articles: { notes: 0, teachingArticles: { explanations: 0, guides: 0, references: 0, tutorials: 0 }, specifications: 0, bibliographies: 0, researchArticles: 0 } },
    },
  },
  code: { src: [], scripts: [], apps: [], test: [] },
  data: { present: false, logs: false, records: false, state: false, other: [] },
  agency: {present:false,pools:[],records:[],resources:[],obstructions:[]},
  services: [],
  legacy: [],
  stray: [],
  laws: {
    uniformAgency:true, dataTrioOnly: true, scriptsVerbNounNaming: true, appsComposeScripts: true, oneTopicPerSection: true,
    contentUnderContentText: true, notesDatedPath: true, noRootWorkspaceFiles: true, legacyIsRevivalInventory: true,
  },
};

test("the schema's own fully-populated engineering worked example is conformant", () => {
  const result = checkServicesSectionFormConformance(conformantEngineeringForm);
  assert.equal(result.conformant, true);
  assert.deepEqual(result.obstructions, []);
});

test("the schema's own thin public worked example is conformant", () => {
  const result = checkServicesSectionFormConformance(conformantThinPublicForm);
  assert.equal(result.conformant, true);
  assert.deepEqual(result.obstructions, []);
});

test("a non-empty data.other violates dataTrioOnly, obstructing at /data/other", () => {
  const form = { ...conformantEngineeringForm, data: { ...conformantEngineeringForm.data, other: ["stray-topic"] } };
  const result = checkServicesSectionFormConformance(form);
  assert.equal(result.conformant, false);
  assert.ok(result.obstructions.some((o) => o.path === "/data/other" && o.keyword === "maxItems"));
});

test("a scripts entry that fails the verb-noun pattern violates scriptsVerbNounNaming, obstructing under /code/scripts", () => {
  const form = { ...conformantEngineeringForm, code: { ...conformantEngineeringForm.code, scripts: ["widget.mjs"] } };
  const result = checkServicesSectionFormConformance(form);
  assert.equal(result.conformant, false);
  assert.ok(result.obstructions.some((o) => o.path === "/code/scripts/0" && o.keyword === "pattern"));
});

test("an invalid custody value obstructs at /custody (substitutes for notesDatedPath, which the record shape cannot express)", () => {
  const form = { ...conformantEngineeringForm, custody: "not-a-real-custody" };
  const result = checkServicesSectionFormConformance(form);
  assert.equal(result.conformant, false);
  assert.ok(result.obstructions.some((o) => o.path === "/custody"));
});

test("refuses a non-object form", () => {
  assert.throws(() => checkServicesSectionFormConformance(null), /form must be a non-null object/u);
  assert.throws(() => checkServicesSectionFormConformance("x"), /form must be a non-null object/u);
  assert.throws(() => checkServicesSectionFormConformance([]), /form must be a non-null object/u);
});

test("apps are engine, server or platform directories; any other app entry is a misfit", () => {
  const withApps = (apps) => checkServicesSectionFormConformance({ ...conformantEngineeringForm, code: { ...conformantEngineeringForm.code, apps } });
  assert.equal(withApps(["widget-engine", "widget-server", "widget-platform"]).conformant, true);
  for (const misfit of ["widget-cli.mjs", "widget", "shop.example.org"]) {
    const { conformant, obstructions } = withApps([misfit]);
    assert.equal(conformant, false, misfit);
    assert.ok(obstructions.some((obstruction) => obstruction.path === "/code/apps/0" && obstruction.keyword === "pattern"), misfit);
  }
});

test("the internal custody has its own profile, and a form deriving no custody fits none", () => {
  const internal = { ...conformantEngineeringForm, custody: "internal", path: "services/internal-services-section/services/internal-widget-services-section", name: "internal-widget-services-section" };
  assert.equal(checkServicesSectionFormConformance({ ...internal, code: { src: [], scripts: [], apps: [], test: [] } }).conformant, true);
  assert.equal(checkServicesSectionFormConformance(internal).conformant, false, "internal sections hold no code");
  assert.equal(checkServicesSectionFormConformance({ ...conformantEngineeringForm, custody: null }).conformant, false);
});


test('the original fold and Group law admit the uniform agency paths in both sibling sections and refuse alternate carriers',()=>{
 for(const section of ['one','two']){
  const request={path:'services/engineering-services-section/services/'+section+'-engineering-services-section',entries:['README.md','package.json','lib/agency/characters/engineer.json','lib/agency/skills/receive/SKILL.md'],packageJson:{name:'@red-cup-engineering/'+section,version:'0.1.0',type:'module'}};
  const form=foldDirectoryEntriesIntoServicesSectionForm(request,law.contentTaxonomy);assert.equal(checkServicesSectionFormConformance(form).conformant,true);assert.equal(form.agency.records.length,2);
  const bad=foldDirectoryEntriesIntoServicesSectionForm({...request,entries:[...request.entries,'lib/agency/characters/alternate.md']},law.contentTaxonomy);const result=checkServicesSectionFormConformance(bad);assert.equal(result.conformant,false);assert.ok(result.obstructions.some(o=>o.path==='/agency/obstructions'));
 }
});
