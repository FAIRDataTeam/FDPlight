# Shared core — extraction plan (TASKS Phase 0)

Status: **proposal**, 2026-10-22. The packaging is decided: option (a), a
`packages/record-core` workspace in the Contour repository. This note says
what moves, what has to change on the way, and in what order. Nothing in
Contour changes until the owner approves this plan.

Survey of Contour at `~/GitHub/Contour` (main, 205 tests green on
2026-10-22; TASKS.md there still says 202).

## 1. Packaging

- Contour becomes an npm workspace root: `packages/record-core/` with its own
  `package.json` (`@fairdatapoint/record-core`, private for now), the app stays
  at the repository root so its build and Pages deploy do not move.
- The package ships **TypeScript and `.vue` sources**, not a build. Both apps
  use Vite with `@vitejs/plugin-vue`, so they compile it directly, and the
  single-file builds stay as they are. No separate build step to maintain.
- FDPlight needs it from another repository. npm cannot install a
  sub-directory of a git repository, so the package is published from a tag
  (`record-core-v0.1.0`) to npm or GitHub Packages, and FDPlight pins the
  exact version. Until the first tag, FDPlight development can use a local
  `file:../Contour/packages/record-core` link (not committed).
- Contour's tests for the moved modules move with them. Contour keeps its app
  tests.

## 2. What moves

| Module | Lines | Depends on | Notes |
|---|---|---|---|
| `types.ts` | 162 | — | `Schema`, `Field`, `NestedShape`, `ShapesDoc`, … |
| `rdf.ts` | 150 | n3, `jsonldParse`, `rdfxml` | parse / serialise any syntax |
| `jsonldParse.ts`, `rdfxml.ts`, `jsonld.ts` | 229, 196, 121 | n3 | parsers and JSON-LD writer |
| `record.ts` | 767 | `rdf`, `jsonld`, `types` | record model, `recordToQuads`, `validateRecord`, `importRecords` |
| `shaclCheck.ts` | 120 | shacl-engine, `rdf`, **`shacl`**, `record` | full SHACL Core check |
| **`shacl.ts`** | 698 | `rdf`, `jsonld`, **`data`** | SHACL ↔ Schema. **Missing from TASKS decision 2**, but FDPlight needs `parseShacl` / `parseToShapes` to build forms from `/spec`, and `shaclCheck` imports it |
| `lookup.ts`, `remote.ts` | 158, 163 | `rdf`, `types` | local and remote (OLS, Wikidata, SPARQL) lookup |
| `components/PreviewField.vue`, `FieldInput.vue`, `LookupInput.vue` | 213, 135, 166 | `useI18n`, `useFillContext`, `Icon.vue` | form renderer |
| `composables/useFillContext.ts` | 22 | — | injection key for filling a record |
| `components/Icon.vue` | 112 | — | used by the renderer |
| `shacl-engine.d.ts` | — | — | typings |

Stays in Contour: `validation.ts` (schema-design checks, not records),
`App.vue`, `RecordPane.vue`, `FormPreview.vue`, `useRecords.ts`,
`usePersistence.ts`, the editor components, `analytics.ts`.

## 3. Contour-only assumptions to remove on the way

1. **Implicit primary shape.** `Schema` has one `shapeIri` / `targetClass`
   plus `nestedShapes`; `record.ts` (`shapeFields`, `importRecords` →
   `noTargetClass`) and `shaclCheck.ts` work on that primary shape.
   FDPlight forms are built from **several peer NodeShapes** per type (e.g.
   Resource + Dataset in `/dataset/spec`). Contour already has the peer model
   (`NodeShape`, `ShapesDoc`, `parseToShapes`, F4) but not as the source of
   truth. Proposal: the package's record API takes a `ShapesDoc` plus the
   list of shapes to merge for one form; Contour wraps its `Schema` with
   `shapesFromLegacy`. This is the F4.2 work Contour deferred, done once in
   the package.
2. **SHACL check rebuilds the shapes from the Schema.** `checkRecordShacl`
   calls `serializeSchema(schema)` to get the shapes graph. FDPlight already
   has the authoritative shapes (`shapes/{type}.ttl`), so the check should
   accept a shapes graph directly; Contour passes `serializeSchema(schema)`.
3. **Unmapped triples are counted, not kept.** `importRecords` returns
   `unmapped: number`. FDPlight must write them back (SPEC §5.7), so the
   result needs the unmapped quads themselves.
4. **`shacl.ts` reaches into editor palette data.** It imports `WIDGET_BY_ID`
   and `newId` from `data.ts` (339 lines of editor widgets and defaults).
   Move only the widget table that SHACL parsing needs (or invert the
   dependency) so the package does not carry the editor palette.
5. **i18n is global and stored in `localStorage`.** The renderer calls
   `useI18n()`, which reads the `localStorage` language key and a catalogue
   of 444 English strings shared with the whole editor. Proposal: the package
   defines its own small message keys (`fieldInput.*`, `lookup.*`, record
   issue texts) and gets `t()` through `provide`/`inject`, with English
   defaults; each app supplies translations. No storage access in the package.
6. **`localStorage` keys.** `useRecords.ts` and `usePersistence.ts` persist
   under Contour keys. They stay in Contour; nothing in the package touches
   storage.
7. **Injection-key names.** `FILL_CONTEXT` is `Symbol('contour.fill')`.
   Rename to a neutral description. Harmless, but it shows in devtools.
8. **`CONTOUR_NS`** (`https://contour.fairdatapoint.org/ns#`) is used for
   editor annotations in generated SHACL. It can stay, and FDPlight must
   ignore those annotations rather than show them.

## 4. Order of work

Each step is one PR in Contour, with Contour's tests green and the single-file
build comparable apart from module order.

1. Create the workspace and move the leaf modules unchanged (`types`, `rdf`,
   parsers, `jsonld`, `lookup`, `remote`) with their tests.
2. Move `record.ts`, `shacl.ts` (with the slimmed widget table, item 4) and
   `shaclCheck.ts`; Contour imports from the package.
3. Move the renderer components with injected i18n (item 5).
4. API changes for FDPlight: shapes graph input to the SHACL check (item 2),
   unmapped quads (item 3), peer-shape forms (item 1). Tag `v0.1.0`.
5. FDPlight depends on the tag and renders one form for the default profile
   (closes Phase 0).

## 5. Questions for the owner

- Package name and scope (`@fairdatapoint/record-core` proposed).
- npm (public) vs GitHub Packages vs git dependency for FDPlight's consumption.
- Whether Contour moves to the FAIRDataTeam organisation too, so the package
  and both apps live together.
