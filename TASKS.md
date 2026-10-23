# FDPlight — Implementation Plan

FDPlight lets a data steward publish a file-only FAIR Data Point. The user
fills in forms generated from the project's metadata schemas, FDPlight writes
correctly wired Turtle files to a GitHub repository, and a GitHub Action
pings the FDP Index. It also opens existing file-only FDPs for editing.

What exactly gets written is defined in [docs/SPEC.md](docs/SPEC.md). This
file tracks how we build it.

## Guiding principles

- **Never hand-written wiring.** Users edit metadata only. Types,
  identifiers, timestamps, child relations, `dct:isPartOf` and LDP containers
  are generated from the project tree on every save.
- **Same output as the RI.** A harvested FDPlight project must look like an
  RI-served FDP to the Index and to FDP clients.
- **Never lose data.** Importing and re-saving an existing file keeps every
  triple FDPlight does not understand.
- **Zero backend.** A static single-page app, like Contour. GitHub is the only
  remote it writes to.
- **Share, don't fork, Contour's record engine.** FDPlight is a separate app
  for data publishers. Contour stays the schema-design tool. Both use the same
  form, record, validation and lookup code.

## Status

| Phase | Theme | Status |
|---|---|---|
| 0 — Shared core | extract Contour's record engine into a package | ✅ package in Contour, on npm, used by FDPlight |
| 1 — Project model and profile | base URI, profile format, import from an FDP | 🟡 all steps in the UI; a guided first-run flow not built |
| 2 — Multi-shape forms | merged shapes per type, form per entity | ✅ default and ERDERA shapes tested |
| 3 — Tree and wiring | entity tree, IRI minting, system triples, LDP | ✅ matches the RI (SPEC §9.5) |
| 4 — Import and edit | open an existing file-only FDP, lossless round trip | ✅ repository import, report, copy by URL |
| 5 — Validation | SHACL plus structural checks before publish | 🟡 both checks live in the editor; publish gating comes with Phase 6 |
| 6 — GitHub publish | auth, single-commit publish, PR mode, conflict check | 🟡 token, one-commit publish, PR mode and conflict check done |
| 7 — Ping and Pages | workflow generation, pilot against home.fairdatapoint.org | ✅ pilot ACTIVE, 4/4 harvested |
| 8 — Polish and docs | i18n, user guide, bundled ERDERA profile | 🟡 all done but translations of the guide |
| 9 — Optional | redirect mode (w3id), profile documents, VP Index auth | ⬜ |

Legend: ⬜ not started · 🟡 in progress · ✅ done.

### Log

- 2026-10-23 — Owner's decisions on the wizard, guide translations, profile documents, metrics and ERDERA follow-ups recorded (#39).
- 2026-10-23 — Accessibility: record-core 0.2.2 names form controls by their label; axe-core finds no violations (#38, Contour #33).
- 2026-10-23 — VP Level 1 / Level 2 queries run in a test over ERDERA output; four problems in the queries recorded (#37).
- 2026-10-23 — Core messages translated in the six locales (#36).
- 2026-10-23 — Profile from local files; base proposal with the folder; custom-domain notes (#35).
- 2026-10-22 — Repository published at github.com/FAIRDataTeam/FDPlight
  (public, MIT). SPEC v0.2 automatic IRI modes (#1). Scaffold and logo (#2).
  SPEC v0.3 timestamp correction (#3).
- 2026-10-22 — Core modules `iri`, `profile`, `project`, `wiring`, `checks`
  with golden tests in both IRI modes (#4). Tagline "a serverless FAIR Data
  Point". Verified: type-check, 79 tests, build 231 kB (150 kB gzip).
- 2026-10-22 — Shared-core extraction plan (#5).
- 2026-10-22 — Decisions: tree derived from the files, shared-core plan
  approved, app hosted on this repository's Pages (#6).
- 2026-10-22 — App live at https://fdplight.fairdatapoint.org/ (Pages from
  `deploy-pages.yml` on every merge to main) (#7).
- 2026-10-23 — record-core 0.2.1 (Contour #32, first release by the npm workflow, with provenance): IRIs outside an `sh:in` list stay IRIs (#34).
- 2026-10-23 — Bundled ERDERA profile, types in use, type defaults (#33).
- 2026-10-23 — Copy an FDP by its URL, with `prov:wasDerivedFrom` (#32).
- 2026-10-23 — Owner's decisions recorded (#30). Served check after connect and publish (#31).
- 2026-10-22 — Forms and checks from real ERDERA shapes; `ejp:` prefix (#29).
- 2026-10-22 — SHACL finding texts translated (#28).
- 2026-10-22 — Data-steward guide with screenshots, linked from the app
  (#26).
- 2026-10-22 — Interface in six languages, Contour's i18n mechanism (#25).
- 2026-10-22 — Keyboard navigation in the entity tree (#24). Verified:
  157 tests.
- 2026-10-22 — RI cross-check: 128 triples identical, two documented
  differences; SPEC v0.8 corrects the RI's container IRIs (#23). GitHub's
  device flow has no CORS (#22).
- 2026-10-22 — Owner's browser pilot run (e1484bb). record-core published on
  npm (0.2.0, Contour #30 release workflow); FDPlight uses it, `vendor/`
  removed (#21). Verified: 154 tests.
- 2026-10-22 — Import a profile from a running FDP in the app (#20).
  Verified: 154 tests.
- 2026-10-22 — "Propose changes" publish mode: branch, commit, pull request
  (#19). Verified: 152 tests.
- 2026-10-22 — Import report: wiring problems and per-file counts of
  triples in the form, regenerated and kept (#18). Verified: 150 tests.
- 2026-10-22 — Move an entity to another parent; the tree starts at an
  imported root's own file instead of `fdp.ttl` (#17). Verified: 148 tests.
- 2026-10-22 — Import of FDPs FDPlight did not make, keep or migrate IRIs;
  WP13.3 test case passes; canonical blank-node labels (#16). Verified:
  142 tests.
- 2026-10-22 — **Pilot**: FDPlight's own FDP published (commit a36180c),
  served by Pages, pinged by the generated workflow, ACTIVE in
  home.fairdatapoint.org with 4/4 entities. Index status in the app (#15).
- 2026-10-22 — Load a project back from its repository on Connect (tree,
  timestamps, metadata, unmapped triples kept); exact round trip (#14).
  Verified: 131 tests.
- 2026-10-22 — Ping workflow generation, repository folder, bundled
  Software profile (FDP → Catalog → Software → Source code, schema.org) and
  profile choice in the editor (#13). Verified: 124 tests.
- 2026-10-22 — GitHub publish: token, connect, review, one commit, conflict
  check, timestamps restamped only when a file changes, published ids
  locked (#12). Verified: 114 tests, build 633 kB.
- 2026-10-22 — SHACL check per entity with findings on the fields and counts
  in the tree; publisher / contact point as sub-forms with hash IRIs (#10).
  Verified: 101 tests, build 620 kB (260 kB gzip; +77 kB shacl-engine).
- 2026-10-22 — Project editor: settings bar (base URI, IRI-mode detection,
  storage base), entity tree with add / rename / delete, form per entity,
  live Turtle and structural checks (#9). Verified: 94 tests, build 543 kB.
- 2026-10-22 — Phase 0 done: record-core extracted in Contour (#25 to #29
  there); FDPlight renders the default-profile forms with the shared renderer
  and previews the Turtle it would publish (#8). Verified: type-check,
  84 tests, build 527 kB (234 kB gzip), checked in headless Chrome.

## Key technical decisions

1. **Stack = Contour's stack.** Vue 3, TypeScript, Vite, single-file build,
   N3.js, shacl-engine, Vitest. No new runtime framework.
2. **Shared code via a package, not a copy.** Contour's `record.ts`, `shacl.ts`,
   `validation.ts`, `shaclCheck.ts`, `lookup.ts`, `remote.ts`, the parsers
   (`rdf.ts`, `jsonldParse.ts`, `rdfxml.ts`) and the renderer components
   (`PreviewField.vue`, `FieldInput.vue`, `LookupInput.vue`) move into a
   package both apps depend on. See Phase 0 for how.
3. **One file per entity, Turtle only.** See SPEC §4.
4. **The project tree is the source of truth for wiring.** Relation triples,
   `dct:isPartOf` and containers are derived, never stored as user data.
5. **Profile mirrors RI resource definitions.** So it can be imported from any
   running FDP with `GET /resource-definitions` and `GET /{prefix}/spec`.

---

## Phase 0 — Shared core ✅

- [x] Extraction plan written and approved 2026-10-22:
      [docs/shared-core.md](docs/shared-core.md). Package
      `@fairdatateam/record-core` on public npm; Contour stays at
      `luizbonino/Contour`.
- [x] Create the npm organisation `fairdatateam` (owner), publish
      `@fairdatateam/record-core` (0.2.0 on 2026-10-22; later versions by
      Contour's tag workflow, Contour #30), drop `vendor/` (#21).
- [x] Decide the packaging (2026-10-22: **option (a)**). Options were
  - (a) a `packages/record-core` workspace in the Contour repo, published to
    npm or consumed as a git dependency;
  - (b) a separate `fdp-forms-core` repository;
  - (c) a git submodule in FDPlight.
- [x] Move the modules listed under decision 2 without behaviour change
      (Contour #25 to #27, 205 tests green throughout, build byte-identical
      or explained).
- [x] Remove Contour-only assumptions from the moved code: peer shapes
      (`formSchema`), external shapes graph, unmapped quads (Contour #28),
      i18n without `localStorage` (#27), renderer stylesheet (#29).
- [x] FDPlight scaffold (Vite, Vue 3, TS, Vitest, single-file build, GitHub
      Pages deploy workflow, CI on PRs, logo and favicons) — #2.
      Verified 2026-10-22: type-check, 1 test, build 231 kB (150 kB gzip).
      Pages deploy is gated on the `DEPLOY_PAGES` repository variable.
- [x] Scaffold imports the shared package and renders the default-profile
      forms, with a live preview of the generated Turtle (#8).

## Phase 1 — Project model and profile 🟡

- [x] `Project` type (base URI, IRI mode, defaults, profile, entities) and its
      JSON form `fdplight.json` (SPEC §3.1) — `src/core/profile.ts`,
      `src/core/project.ts`. The entity tree is not yet persisted (open
      decision 5).
- [ ] New-project wizard, optional (decided 2026-10-23): a guided
      first-run flow the user may follow or skip. The steps also stay in the
      settings bar and the connect form.
  - [x] target repository (owner/name, branch): the connect form (#12);
  - [x] **base URI**, proposed as `https://{owner}.github.io/{repo}/` plus
        the project folder on connect, editable, validated (absolute https,
        ends with `/`) (#9, #35). A custom domain cannot be proposed: reading
        it needs *Pages: read* on the token (SPEC §2.2, §9.2). The mode
        question and the "not online" note now explain custom domains (#35);
  - [x] profile source: bundled (#13), import from an FDP URL (#20), or
        local files, a JSON with the types and the shape files it names
        (#35, SPEC §3.3).
- [x] Profile import from a running FDP (`importProfileFromFdp`, tested on
      recorded home.fairdatapoint.org responses). Read `/resource-definitions`, fetch
      `/{prefix}/spec` (`/spec` for the root), store the merged shapes under
      `shapes/`. Record the source for later refresh. In the app from the
      profile list, "Import from a FAIR Data Point…" (#20); CORS verified
      (SPEC §9.2).
- [x] Bundled FDP default profile (taken from home.fairdatapoint.org),
      `src/profiles/fdp-default/`.
- [x] IRI mode detection from the base URI (SPEC §2.2): `*.github.io` and
      the repository's Pages CNAME give file mode, known redirectors (w3id,
      purl) give redirect mode, anything else asks once. User can override.
- [x] Re-base IRI mapping (`rebaser`) for the re-base action (SPEC §2.5),
      also used for mode switches. UI still open. Silent before
      first publish, warning after.
- [x] Unit tests for profile parsing, base validation and re-basing.

## Phase 2 — Multi-shape forms ✅

The `/spec` response for a type is a graph of several NodeShapes (e.g.
Resource plus Dataset). Contour still treats the first shape as primary
(its F4.2 is deferred).

- [x] For a given type, build the form from **all** NodeShapes whose
      `sh:targetClass` is one of the type's target classes. Merge their
      property shapes, keep `sh:group` / `sh:order`, de-duplicate identical
      paths (record-core `formSchema`, FDPlight `entityForm`).
- [x] Nested shapes (`sh:node`) keep working as sub-forms (non-matching
      shapes stay nested).
- [x] Hide the paths FDPlight generates (SPEC §5.2 to 5.5) from the form even
      when a schema declares them, e.g. `dct:isPartOf`,
      `fdp:metadataIdentifier`, `fdp:metadataIssued`, `fdp:metadataModified`,
      and for catalogs only `dct:issued` / `dct:modified` (SPEC §5.3).
      Datasets and distributions keep `dct:issued` / `dct:modified` as
      user fields.
- [x] Tests with the real merged shapes of the default (done) and ERDERA
      profiles (#29: ERDERA's Resource + PatientRegistry shapes from
      ERDERA/FDP-Reference-Implementation-Configuration; merged form, nested
      OrgShape and AnnotationShape sub-forms, checks on the complete file,
      `dct:hasPart` from the catalog). The bundled ERDERA profile itself is
      Phase 8.

## Phase 3 — Tree and wiring ✅

- [x] Entity tree UI. Root at the top, children grouped by child type (using
      the list titles), add / rename / delete (#9), move (#17).
- [x] Move an entity to another parent (#17). "Move to" lists the parents the
      profile allows, outside the entity's own subtree; file and IRI stay, so
      published entities can move (SPEC §5.5).
- [x] IRI minting (SPEC §2.3), both IRI modes (`src/core/iri.ts`). Random id
      by default, slug editable in the editor (#9); locking after the first
      publish comes with publishing.
- [x] `serializeEntity(project, entity, userGraph)` producing the full graph
      for one file (`src/core/wiring.ts`), plus `toTurtle` (clean Turtle,
      used prefixes only)
  - [x] user metadata from the record engine (`userGraphFromForm`, #10);
  - [x] system triples (SPEC §5.2), catalog extras (§5.3), root extras (§5.4);
  - [x] child relations and one `ldp:DirectContainer` per child type, empty
        ones included (§5.5);
  - [x] hash IRIs for publisher / contact point (§5.6): minted when the
        graph is built, never stored (`withHashNodes`, #10). Fields with
        `sh:node` (the FDP's `dash:BlankNodeEditor`) render as sub-forms.
- [x] Timestamp rules. `fdp:metadataIssued` set once, `fdp:metadataModified`
      when the entity's file changes (plus `dct:issued` / `dct:modified` for
      catalogs), which also covers parents whose containers change
      (`planPublish`, #11).
- [x] Golden-file tests (both IRI modes, `src/core/__tests__/golden/`). Build the default-profile example tree and compare
      each file with the expected Turtle, triple by triple.
- [x] Cross-check against the RI. Create the same tree in a local RI
      (`fdp-ri` compose), fetch each entity, diff the graphs ignoring
      IRIs and the documented differences (#23, `scripts/ri-crosscheck.ts`).
      RI 1.22.0: 128 triples identical; the only differences are the
      publisher node (blank in the RI, `E#publisher` in FDPlight) and the
      RI root's `dcat:endpointDescription` (SPEC §9.5). Found on the way: the
      RI names every catalog's dataset container `{persistentUrl}/dataset/`,
      so the RI itself shares container IRIs across parents (SPEC §2.6
      corrected).

## Phase 4 — Import and edit ✅

- [x] Open a project from a repository with `fdplight.json`; the tree is
      rebuilt from the files (SPEC §4.1): containers win, `dct:isPartOf` as
      fallback, siblings by title. Loads on Connect, with the repository's own
      shapes; asks before replacing local work (#14). Round trip verified:
      load → publish again changes nothing.
- [x] Open a file-only FDP **without** `fdplight.json` from its repository:
      pick the root file, keep the IRIs or migrate (SPEC §4.2, #16).
- [x] Same by its root URL only (no repository access). Decided 2026-10-23:
      new IRIs under the project base, each record with
      `prov:wasDerivedFrom` its old IRI (#32, SPEC §4.3,
      `src/core/importUrl.ts`). Verified live on
      https://w3id.org/simpathic/fdp (RI behind w3id, 7 records) in a browser;
      `scripts/import-url.ts` is a dry run. Crawl the same links the Index follows (LDP containers,
      else the navigation relations), infer each entity's type from its
      `rdf:type` and the chosen profile, rebuild the tree, then save a
      `fdplight.json`.
- [x] Split each fetched graph into user metadata (mapped to the form), system
      triples (regenerated) and **unmapped triples (kept verbatim)**, using
      record-core's `unmappedQuads` (Contour #28) (#14).
- [x] Report on import. Unreadable files, missing types, parent
      disagreements, orphans and dangling links (#14); shared container IRIs
      and identifier nodes that do not match the entity, and per file the
      triples read into the form, regenerated and kept (#18, SPEC §4.2).
- [x] Test case. Import ERDERA/WP13.3_document_based_fdp (proqolid), save, and
      check that the container clash and the identifier typo are gone and no
      user metadata was lost (#16; both modes; keep mode round-trips
      exactly).

## Phase 5 — Validation 🟡

- [x] Per entity SHACL check against the type's shapes, on the complete file
      graph so system triples count (`src/core/validation.ts`, record-core
      `checkRecordShacl` with the FDP's shapes graph). Findings on the form
      fields, red counts in the tree (#10).
- [x] Structural checks of SPEC §6 rules 2 to 7 (`src/core/checks.ts`) (base, dangling links, orphans, duplicate
      IRIs, malformed IRIs, root type).
- [x] Publish button disabled while there are errors (#12), with a list that jumps
      to the offending entity and field.

## Phase 6 — GitHub publish 🟡

- [x] Authentication for the pilot: fine-grained personal access token
      (contents read/write on one repository) kept in `sessionStorage` (#12).
      CORS of api.github.com verified (SPEC §9.2).
- [x] ~~Then evaluate a GitHub App.~~ Not pursued (decided 2026-10-23). Checked 2026-10-22: its device flow does
      **not** work from a browser without a proxy. `github.com/login/device/code`
      answers 200 without `Access-Control-Allow-Origin`, and the preflight
      returns 404 (SPEC §9.2). A GitHub App therefore needs a small token
      proxy, which a serverless FDPlight does not have. Fine-grained tokens
      stay until the owner decides otherwise (open decision 4).
- [x] Read the repository tree and the files FDPlight owns (#12). Loading a
      project back from them is Phase 4.
- [x] Publish as **one commit** with all changed files (Git data API: blobs,
      tree, commit, update ref). Commit message lists the entities changed.
      A review step shows added / updated / removed files first (#12).
- [x] Conflict check. Compare the remote head with the head the project was
      loaded from; the ref update is also non-forced. On mismatch nothing is
      written and the user is told to reconnect (#12). Showing what changed
      comes with Phase 4 loading.
- [x] "Propose changes" mode. Same commit on a new branch plus a pull request
      (#19, SPEC §7.1).
- [x] First-publish helper (decided 2026-10-23): check that the base URI is
      served and, if not, explain how to enable Pages. No repository
      creation, no extra token permission (#31, SPEC §7.1). Verified in a
      browser: the live FDP reads as served, a repository without Pages as
      not served.

## Phase 7 — Ping and Pages ✅

- [x] Generate `.github/workflows/fdp-ping.yml` (SPEC §7.2) with the Index
      and root URLs inline (decided 2026-10-22, no repository variables),
      triggered by a configurable Pages workflow (#13).
- [x] Repository folder for the FDP (`folder`, SPEC §4) so an FDP can live
      next to other content, e.g. this repository's `metadata/` (#13).
- [x] Verify that `workflow_run` fires after each Pages deployment. Pilot:
      FDPlight's own repository (Pages by "Deploy to GitHub Pages"): fired
      after each deploy, succeeded.
- [x] End-to-end pilot against **home.fairdatapoint.org** (the ERDERA VP Index
      needs authorization) with **FDPlight's own FDP** (decided 2026-10-22):
      metadata about FDPlight under `metadata/` of this repository, Software
      profile, direct commits to main, first run by script then by the owner
      in the browser. Create, publish, wait for Pages, ping, then check
      `GET /index/entries/all` (state ACTIVE) and
      `GET /index/entries/{uuid}/data` (all entities harvested). Done
      2026-10-22 by script: ACTIVE, 4 of 4 harvested (SPEC §9.2). The
      owner's browser run worked the same day: connect, load, edit the
      software description, review (one file), publish as e1484bb; Pages
      serves the new version and the Index harvested it (its
      `fdp:metadataModified` is in the entry's data). That deploy run hung
      on GitHub's side, so its ping fired only with the next deploy.
- [x] Check whether `GET /index/entries/{uuid}` works for the pilot entry:
      200 (WP13.3 still 500, SPEC §9.4).
- [x] Show the Index status of the project in FDPlight (read-only, public
      endpoints): state, last update, harvested vs missing entities (#15).

## Phase 8 — Polish and docs 🟡

- [ ] i18n with Contour's mechanism and the same six locales. The interface
      and the form renderer are translated (EN, PT-BR, NL, DE, ES, FR; the
      renderer keys reuse Contour's translations), with a language picker in
      the header (#25). SHACL finding texts under the fields are translated
      too (#28). Messages built by the core (structural checks, tree and
      settings errors, load, import and copy reports, profile files) are
      translated by key (#36, `src/core/messages.ts`). Still English: the
      JSON-format errors of `fdplight.json` and profiles (for profile
      authors), errors passed on from GitHub or the browser, and labels from
      the profile's shapes. The translations were written without a
      native-speaker review.
- [ ] Translations of the guide in the five other locales (decided
      2026-10-23: now, marked as not reviewed by a native speaker).
- [ ] ERDERA profile follow-ups (decided 2026-10-23, SPEC §8.6): require
      `dct:type` on data services (a third change to ERDERA's shapes) and
      warn when a record is set to `ejp:VPInvisible`.
- [ ] Profile documents at `{base}profile/{type}.ttl` (decided 2026-10-23,
      SPEC §8.1): the type's merged SHACL.
- [x] User guide for data stewards (create, fill in, publish, edit), with
      screenshots, in the style of Contour's data-steward guide
      ([docs/data-steward-guide.md](docs/data-steward-guide.md), #26; English
      only; screenshots from `scripts/shoot.cjs`). Linked from the app
      header. Translations of the guide are still open.
- [x] Bundled ERDERA profile (#33, `src/profiles/erdera/`, SPEC §3.2):
      types, shapes, type defaults, types in use, child types told apart by
      path or `rdf:type`. Checked against the VP Index (SPEC §9.2) and, by a
      test, against the VP Level 1 / Level 2 queries of WP13.3 (#37, SPEC
      §9.6): every type is listed; problems found in the queries are listed
      there. Decided 2026-10-23: all
      ERDERA types (FDP → catalog → dataset → distribution, plus patient
      registry, biobank, guideline, data services); the user ticks the types
      in use; `ejp:vpConnection ejp:VPDiscoverable` unless hidden and
      `fdp:conformsToFdpSpec` on the root are written by the profile.
- [x] Accessibility pass. Keyboard tree navigation (#24): arrow keys,
      Home and End, Left to the parent, Right to the first child; only the
      selected node is a Tab stop; visible focus ring. Automated check with
      axe-core 4.13 in Chromium over five states (initial, a catalog, the
      three settings forms, ERDERA): the only violations were in the shared
      form renderer (controls without a name, a low-contrast badge), fixed in
      record-core 0.2.2 with `aria-invalid` added (Contour #33, #38). Now no
      violations. Not done: a test with a screen reader.

## Phase 9 — Optional ⬜

- [ ] Redirect mode UI and publishing (SPEC §2.4): storage base, generated
      w3id `.htaccess` rules, check that `{base}` resolves before publishing.
      The IRI rules themselves are in the Phase 1/3 core and tested in both
      modes.
- [ ] VP Index authorization in the ping workflow, once the mechanism is
      documented.
- [ ] Bulk creation from CSV (overlaps with ejp-rd-vp/fdp-populator).

---

## Open decisions

See also SPEC §8.

10. ~~Wizard, guide translations, profile documents, metrics, ERDERA.~~
    Decided 2026-10-23: optional wizard; translate the guide now; publish
    the merged SHACL as profile document; no default metrics (the metric
    triples are expected to leave the FDP specification); ERDERA data
    services need `dct:type` and hiding a record warns. The issues found in
    ERDERA's queries and shapes (SPEC §9.6, §3.2) are for later, with
    ERDERA; many can be fixed directly. Redirect mode stays in Phase 9.

1. ~~Packaging of the shared core (Phase 0).~~ Decided 2026-10-22: option (a),
   a `packages/record-core` workspace in the Contour repo.
2. ~~Licence of FDPlight.~~ Decided 2026-10-22: MIT, like Contour.
3. ~~Where FDPlight itself is hosted.~~ Decided 2026-10-22: GitHub Pages of
   this repository at https://fdplight.fairdatapoint.org/ (item 6).
4. ~~GitHub authentication beyond the pilot (Phase 6).~~ Decided
   2026-10-23: fine-grained tokens only; a GitHub App would need a proxy.
7. ~~Import by URL: IRIs.~~ Decided 2026-10-23: new IRIs plus
   `prov:wasDerivedFrom` to the old IRI.
8. ~~First publish and Pages.~~ Decided 2026-10-23: Pages stays the default,
   FDPlight checks that the base URI is served (no extra token permission).
9. ~~ERDERA profile.~~ Decided 2026-10-23: all ERDERA types, the user ticks
   the types in use; VP visibility and `fdp:conformsToFdpSpec` written by the
   profile (SPEC §8.4).
5. ~~Where the entity tree is stored.~~ Decided 2026-10-22: not stored,
   derived from the files on open (SPEC §4.1).
6. ~~Custom domain for the app.~~ Done 2026-10-22: https://fdplight.fairdatapoint.org/
   (CNAME to `fairdatateam.github.io`, domain verified for the FAIRDataTeam
   org, HTTPS enforced).

## Related work

- **ERDERA/WP13.3_document_based_fdp** — hand-written file-only FDPs on GitHub
  Pages. First import test case.
- **ERDERA/static-fdp** (also markwilkinson/static-fdp) — StaticFDP, with a
  ReSpec layout document (`docs/fdp-layout.html`) and the fdpcloud.org server
  that serves cloned GitHub repositories.
- **markwilkinson/FDP-Index-Proxy** — injects FDP-specific elements into
  plain DCAT records for the Index (OSTrails).
- **ejp-rd-vp/fdp-populator** — populates a running FDP from CSV through
  GitHub Actions. Needs a deployed FDP.
- **Contour** — the SHACL editor whose record engine FDPlight reuses.
