# Handoff — FDPlight implementation

This note is for the implementation agent (Claude Code in VS Code) and for
any human picking up FDPlight. It explains where things stand, what has been
decided, and what to do first.

## 1. What FDPlight is

A zero-backend browser app that lets a data steward publish a **file-only
FAIR Data Point**. The steward fills in forms generated from SHACL metadata
schemas. FDPlight writes one Turtle file per entity (FDP root, catalogs,
datasets, …) with all the wiring the FDP reference implementation (RI) would
add, commits the files to a GitHub repository served by GitHub Pages, and adds
a GitHub Action that pings the FDP Index. It can also open and edit existing
file-only FDPs.

Driver. ERDERA partners who cannot deploy an FDP currently hand-write these
files. That is error-prone (see the problems found in SPEC §9.4). FDPlight
removes the hand-writing.

## 2. Read these first

1. [`docs/SPEC.md`](docs/SPEC.md) — **the contract**. Exactly which files,
   IRIs and triples FDPlight writes, each rule traced to RI code or a live
   check. When code and SPEC disagree, fix one of them explicitly, never
   silently.
2. [`TASKS.md`](TASKS.md) — the phased plan (Phases 0 to 9) and open
   decisions.
3. [`README.md`](README.md) — the short pitch.

## 3. Decisions already taken

| Topic | Decision |
|---|---|
| Name | **FDPlight** |
| Form factor | **Separate app**, sharing code with Contour (not a mode inside Contour) |
| Stack | Same as Contour. Vue 3 + `<script setup>`, TypeScript, Vite with `vite-plugin-singlefile`, N3.js, shacl-engine, Vitest |
| Output | One Turtle file per entity, clean Turtle, only used prefixes |
| Base URI | Supplied by the user per project, must end with `/`, proposed from the repo as `https://{owner}.github.io/{repo}/` |
| Wiring | Derived from the project tree on every save. Users never edit relations, `dct:isPartOf`, LDP containers, identifiers or timestamps |
| Container IRIs | Always derived from the parent entity IRI, so two files can never declare the same container |
| Unknown triples | Kept verbatim on import and written back |
| Licence | MIT |
| Shared core | `packages/record-core` workspace in the Contour repo (TASKS Phase 0 option (a)) |
| Repository | github.com/FAIRDataTeam/FDPlight (public). Work lands through pull requests |
| Test Index | **home.fairdatapoint.org** (FDP v1.22.1). The ERDERA VP Index requires authorization, do not target it yet |

### 3.1 Automatic IRI mode (written into SPEC §2.2 to 2.4 in v0.2)

**Automatic IRI mode from the base URI.** Fold this into SPEC §2 (and the
Phase 1 / Phase 9 tasks) as your first commit.

| Base URI host | Mode | Entity IRIs |
|---|---|---|
| `*.github.io` | file | `{base}fdp.ttl`, `{base}{prefix}/{id}.ttl` |
| custom domain equal to the target repo's Pages CNAME (GitHub API) | file | as above |
| `w3id.org`, `purl.org` and other known redirectors | redirect | `{base}` for the root, `{base}{prefix}/{id}` |
| anything else | ask the user once | |

- The user can override the detected mode.
- Redirect mode needs a second URI, the **storage base** (the Pages URL where
  the `.ttl` files live). Files keep their `.ttl` names in both modes.
- In redirect mode FDPlight generates the w3id `.htaccess` rules (roughly
  `{base}` → `{storage}fdp.ttl`, `{base}(.+)` → `{storage}$1.ttl`) and, before
  publishing, checks that `{base}` resolves to the root file. w3id changes go
  through a reviewed PR, so IRIs work only after it is merged.
- Container IRIs. File mode uses `{entity}#{childPrefix}`. Redirect mode uses
  the RI form `{entity}/{childPrefix}/`.
- Switching mode after the first publish changes every IRI and goes through
  the warned re-base step (SPEC §2.5).
- Evidence that the Index follows w3id redirects at every level.
  home.fairdatapoint.org has ACTIVE entries `https://w3id.org/duchenne-fdp`
  and `https://w3id.org/simpathic/fdp` whose harvested data
  (`GET /index/entries/{uuid}/data`) contains catalogs and other children
  under their w3id IRIs.

## 4. What to do in the first session

The packaging of the shared Contour code (Phase 0) is still an **open
decision for the owner**. Do **not** modify the Contour repository until
Luiz has chosen an option. Everything below can be done without it, because
it is FDPlight-specific logic that does not depend on the form engine.

1. **SPEC update.** Apply §3.1 above to `docs/SPEC.md` and `TASKS.md`. Commit.
2. **Scaffold.** Vite + Vue 3 + TS app mirroring Contour's setup
   (`package.json` scripts `dev`, `build`, `type-check`, `test`; single-file
   build; strict TS; Vitest with happy-dom). One placeholder view. A GitHub
   Pages deploy workflow modelled on `Contour/.github/workflows/deploy-pages.yml`.
3. **Pure core modules with tests** (no UI yet), under `src/core/`
   - `profile.ts` — the profile type and `fdplight.json` (SPEC §3.1), parsing
     and validation, plus `importProfileFromFdp(fdpUrl)` using
     `GET /resource-definitions` and `GET /{prefix}/spec` (`/spec` for the
     root). Unit tests against recorded responses, not the live server.
   - `iri.ts` — base URI validation, IRI-mode detection (§3.1), id minting,
     entity / container / hash IRIs (SPEC §2), re-basing.
   - `wiring.ts` — `serializeEntity(project, entity, userGraph)` producing the
     full graph of one file with the system triples (SPEC §5.2 to 5.5).
     Takes the user metadata as an N3 `Store` so it does not depend on the
     form engine yet.
   - `checks.ts` — the structural checks of SPEC §6 (rules 2 to 7).
4. **Golden tests.** Build the default-profile tree (root → 1 catalog → 1
   dataset → 1 distribution, plus an empty child type) in both IRI modes and
   compare every file with expected Turtle under `src/core/__tests__/golden/`,
   triple by triple (isomorphism, not string equality).
5. **Phase 0 proposal.** Write a short `docs/shared-core.md` comparing the
   packaging options in TASKS.md Phase 0, listing the exact Contour modules to
   move and what Contour-specific assumptions they carry (implicit primary
   shape in the `Schema` type, `localStorage` keys). Stop there for the
   owner's decision.

**Done when** `npm run type-check`, `npm test` and `npm run build` pass, the
golden tests cover both IRI modes, and the SPEC reflects §3.1.

## 5. Local repositories and where to look

All under `~/GitHub/`.

| Repo | Use it for |
|---|---|
| `Contour` | The code FDPlight will share. `src/record.ts` (record model, RDF generation, import), `src/validation.ts`, `src/shaclCheck.ts` (shacl-engine), `src/lookup.ts`, `src/remote.ts`, parsers `src/rdf.ts`, `src/jsonldParse.ts`, `src/rdfxml.ts`, components `PreviewField.vue`, `FieldInput.vue`, `LookupInput.vue`, `RecordPane.vue`, composable `useRecords.ts`. Design history in `TASKS.md` (Phase 7 "light FDP", F4 peer shapes). Read-only for now. |
| `FAIRDataPoint` | The RI, the behaviour to match. `rdf/metadata/MetadataEnhancer.java` (system triples and LDP), `MetricsMetadataService.java`, `resource/ResourceDefinition.java`, `rdf/metadata/GenericController.java` (`/spec`, `dct:isPartOf`), `index/IndexPingController.java`, `index/entry/HarvesterService.java`, `index/event/MetadataRetrievalUtils.java`, `src/main/resources/defaultNavigationShacl.ttl`, `reset/FactoryDefaults.java`. Read-only. |
| `fdp-ri` | Docker compose for a local RI, for the Phase 3 cross-check (create the same tree in the RI and diff graphs). |
| `fdpneo` | Another form generator (server-bound). Not a dependency. |
| `ERDERA` | ERDERA material, useful for the ERDERA profile later. |

Remote references

- `ERDERA/WP13.3_document_based_fdp` — hand-written file-only FDPs on Pages.
  First import test case (`sites/proqolid/`).
- `ERDERA/static-fdp` — StaticFDP, layout document `docs/fdp-layout.html`.
- `ERDERA/FDP-Reference-Implementation-Configuration` (and the `ejp-rd-vp`
  original) — EJP RD / ERDERA SHACL shapes and RI configuration.

## 6. Facts verified on 2026-10-22 (do not re-derive, but re-check if behaviour differs)

- **Ping.** `POST https://home.fairdatapoint.org/` with
  `Content-Type: application/json` and `{"clientUrl": "<root IRI>"}` returns
  204 and triggers harvesting within seconds. JSON only. Rate limited per IP
  and per URL. An entry with no ping for a week becomes INACTIVE.
- **Index API (public).** `GET /index/entries/all`, `GET /index/entries/{uuid}`,
  `GET /index/entries/{uuid}/data` (Turtle of everything harvested).
- **FDP API (public).** `GET /resource-definitions`, `GET /metadata-schemas`,
  `GET /{prefix}/spec` all answer without authentication on
  home.fairdatapoint.org.
- **Harvester.** Follows `ldp:DirectContainer` / `ldp:contains` when present,
  otherwise `fdp:metadataCatalog`, `dcat:dataset`, `dcat:distribution`,
  `dct:isPartOf`, `r3d:dataCatalog`. Parses every response as Turtle (RI
  issue in SPEC §9.3).
- **Root type.** The root must have `fdp:MetadataService` or `r3d:Repository`
  as an explicit `rdf:type` for the Index to read its title and publisher.
- **GitHub Pages content types.** `.ttl` → `text/turtle; charset=utf-8`.
  No extension → `application/octet-stream`.
- **Known Index oddity.** `GET /index/entries/{uuid}` returns 500 for the
  WP13.3 entry (`10ba3529-7156-434f-b6ae-6ce98896e9ae`) while other entries
  work. Suspected cause is the blank-node publisher (unconfirmed). FDPlight
  uses `{entity}#publisher` hash IRIs for that reason.

## 7. Rules of engagement

- **Do not ping public Indexes from tests or CI.** Tests use recorded
  responses. Live pings happen only in the deliberate Phase 7 pilot.
- **Do not modify other repositories** (`Contour`, `FAIRDataPoint`, …)
  without asking. Propose changes as notes or patches instead.
- **Ask when in doubt.** Open decisions are listed in TASKS.md and SPEC §8.
  Do not settle them silently. Bring options with a recommendation.
- **Do not invent facts.** Anything about RI behaviour, the Index or ERDERA
  must come from code, docs or a live check, and be cited in SPEC §9 when it
  drives a rule.
- **Keep SPEC.md the source of truth.** Every behaviour in `src/core/` maps to
  a SPEC section, referenced in a comment at the top of the function.
- **Tests first for wiring.** Every rule in SPEC §5 gets at least one test.
- Small, focused commits. Update the status table in TASKS.md as phases
  progress, with a "Verified" note (tests, type-check, build size) like
  Contour's TASKS.md does.

## 8. Open decisions (owner)

1. ~~Packaging of the shared core.~~ Decided: option (a), a
   `packages/record-core` workspace in Contour. Changes to Contour still go
   through the owner.
2. ~~Licence.~~ Decided: MIT.
3. Hosting of FDPlight itself (e.g. a `fairdatapoint.org` subdomain).
4. GitHub authentication beyond a fine-grained token for the pilot.
5. SPEC §8 items (profile documents, container IRI form in file mode, default
   metrics, ERDERA-specific triples, redirect-mode timing).
