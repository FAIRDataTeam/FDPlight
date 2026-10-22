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
| 0 — Shared core | extract Contour's record engine into a package | 🟡 packaging decided, scaffold done |
| 1 — Project model and profile | base URI, profile format, import from an FDP | 🟡 core done, UI open |
| 2 — Multi-shape forms | merged shapes per type, form per entity | ⬜ |
| 3 — Tree and wiring | entity tree, IRI minting, system triples, LDP | 🟡 core and golden tests done, UI open |
| 4 — Import and edit | open an existing file-only FDP, lossless round trip | ⬜ |
| 5 — Validation | SHACL plus structural checks before publish | 🟡 structural checks done |
| 6 — GitHub publish | auth, single-commit publish, PR mode, conflict check | ⬜ |
| 7 — Ping and Pages | workflow generation, pilot against home.fairdatapoint.org | ⬜ |
| 8 — Polish and docs | i18n, user guide, bundled ERDERA profile | ⬜ |
| 9 — Optional | redirect mode (w3id), profile documents, VP Index auth | ⬜ |

Legend: ⬜ not started · 🟡 in progress · ✅ done.

### Log

- 2026-10-22 — Repository published at github.com/FAIRDataTeam/FDPlight
  (public, MIT). SPEC v0.2 automatic IRI modes (#1). Scaffold and logo (#2).
  SPEC v0.3 timestamp correction (#3).
- 2026-10-22 — Core modules `iri`, `profile`, `project`, `wiring`, `checks`
  with golden tests in both IRI modes (#4). Tagline "a serverless FAIR Data
  Point". Verified: type-check, 79 tests, build 231 kB (150 kB gzip).
- 2026-10-22 — Shared-core extraction plan (#5).
- 2026-10-22 — Decisions: tree derived from the files, shared-core plan
  approved, app hosted on this repository's Pages (#6).

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

## Phase 0 — Shared core 🟡

- [x] Extraction plan written and approved 2026-10-22:
      [docs/shared-core.md](docs/shared-core.md). Package
      `@fairdatateam/record-core` on public npm; Contour stays at
      `luizbonino/Contour`.
- [ ] Create the npm organisation `fairdatateam` (owner, needs an npm
      account).
- [x] Decide the packaging (2026-10-22: **option (a)**). Options were
  - (a) a `packages/record-core` workspace in the Contour repo, published to
    npm or consumed as a git dependency;
  - (b) a separate `fdp-forms-core` repository;
  - (c) a git submodule in FDPlight.
- [ ] Move the modules listed under decision 2 without behaviour change.
      Contour's 202 tests stay green, the single-file build stays byte
      comparable apart from module order.
- [ ] Remove Contour-only assumptions from the moved code (the `Schema` type
      with an implicit primary shape, `localStorage` keys).
- [x] FDPlight scaffold (Vite, Vue 3, TS, Vitest, single-file build, GitHub
      Pages deploy workflow, CI on PRs, logo and favicons) — #2.
      Verified 2026-10-22: type-check, 1 test, build 231 kB (150 kB gzip).
      Pages deploy is gated on the `DEPLOY_PAGES` repository variable.
- [ ] Scaffold imports the shared package and renders one form.

## Phase 1 — Project model and profile 🟡

- [x] `Project` type (base URI, IRI mode, defaults, profile, entities) and its
      JSON form `fdplight.json` (SPEC §3.1) — `src/core/profile.ts`,
      `src/core/project.ts`. The entity tree is not yet persisted (open
      decision 5).
- [ ] New-project wizard
  - [ ] target repository (owner/name, branch);
  - [ ] **base URI**, proposed as `https://{owner}.github.io/{repo}/`,
        editable, validated (absolute https, ends with `/`);
  - [ ] profile source (bundled, import from an FDP URL, or a local file).
- [x] Profile import from a running FDP (`importProfileFromFdp`, tested on
      recorded home.fairdatapoint.org responses). Read `/resource-definitions`, fetch
      `/{prefix}/spec` (`/spec` for the root), store the merged shapes under
      `shapes/`. Record the source for later refresh.
- [ ] Bundled FDP default profile (taken from home.fairdatapoint.org).
- [x] IRI mode detection from the base URI (SPEC §2.2): `*.github.io` and
      the repository's Pages CNAME give file mode, known redirectors (w3id,
      purl) give redirect mode, anything else asks once. User can override.
- [x] Re-base IRI mapping (`rebaser`) for the re-base action (SPEC §2.5),
      also used for mode switches. UI still open. Silent before
      first publish, warning after.
- [x] Unit tests for profile parsing, base validation and re-basing.

## Phase 2 — Multi-shape forms ⬜

The `/spec` response for a type is a graph of several NodeShapes (e.g.
Resource plus Dataset). Contour still treats the first shape as primary
(its F4.2 is deferred).

- [ ] For a given type, build the form from **all** NodeShapes whose
      `sh:targetClass` is one of the type's target classes. Merge their
      property shapes, keep `sh:group` / `sh:order`, de-duplicate identical
      paths.
- [ ] Nested shapes (`sh:node`) keep working as sub-forms.
- [ ] Hide the paths FDPlight generates (SPEC §5.2 to 5.5) from the form even
      when a schema declares them, e.g. `dct:isPartOf`,
      `fdp:metadataIdentifier`, `fdp:metadataIssued`, `fdp:metadataModified`,
      and for catalogs only `dct:issued` / `dct:modified` (SPEC §5.3).
      Datasets and distributions keep `dct:issued` / `dct:modified` as
      user fields.
- [ ] Tests with the real merged shapes of the default and ERDERA profiles.

## Phase 3 — Tree and wiring 🟡

- [ ] Entity tree UI. Root at the top, children grouped by child type (using
      the list titles), add / rename / delete / move.
- [x] IRI minting (SPEC §2.3), both IRI modes (`src/core/iri.ts`); slug
      locking after first publish belongs to the UI. Random id by default, editable slug until first
      publish, locked afterwards.
- [x] `serializeEntity(project, entity, userGraph)` producing the full graph
      for one file (`src/core/wiring.ts`), plus `toTurtle` (clean Turtle,
      used prefixes only)
  - [ ] user metadata from the record engine (takes an N3 `Store` until then);
  - [x] system triples (SPEC §5.2), catalog extras (§5.3), root extras (§5.4);
  - [x] child relations and one `ldp:DirectContainer` per child type, empty
        ones included (§5.5);
  - [ ] hash IRIs for publisher / contact point (§5.6) — kept when given;
        minting them is the form engine's job.
- [ ] Timestamp rules. `fdp:metadataIssued` set once, `fdp:metadataModified`
      on every save of that entity (plus `dct:issued` / `dct:modified` for
      catalogs). Parents whose containers change also get a new
      modification time.
- [x] Golden-file tests (both IRI modes, `src/core/__tests__/golden/`). Build the default-profile example tree and compare
      each file with the expected Turtle, triple by triple.
- [ ] Cross-check against the RI. Create the same tree in a local RI
      (`fdp-ri` compose), fetch each entity, diff the graphs ignoring
      IRIs and the documented differences.

## Phase 4 — Import and edit ⬜

- [ ] Open a project from a repository with `fdplight.json`; the tree is
      rebuilt from the files (SPEC §4.1), the same crawl as below.
- [ ] Open a file-only FDP **without** `fdplight.json` by its root URL (or a
      repository). Crawl the same links the Index follows (LDP containers,
      else the navigation relations), infer each entity's type from its
      `rdf:type` and the chosen profile, rebuild the tree, then save a
      `fdplight.json`.
- [ ] Split each fetched graph into user metadata (mapped to the form), system
      triples (regenerated) and **unmapped triples (kept verbatim)**. Contour
      today counts unmapped triples but does not write them back. This is the
      main change needed in the shared record engine.
- [ ] Report on import. Per entity, how many triples were mapped, regenerated
      and kept, plus wiring problems found (shared container IRIs, dangling
      links, identifier IRIs that do not match the entity).
- [ ] Test case. Import ERDERA/WP13.3_document_based_fdp (proqolid), save, and
      check that the container clash and the identifier typo are gone and no
      user metadata was lost.

## Phase 5 — Validation 🟡

- [ ] Per entity SHACL check (built-in checks plus shacl-engine) against the
      type's merged shapes.
- [x] Structural checks of SPEC §6 rules 2 to 7 (`src/core/checks.ts`) (base, dangling links, orphans, duplicate
      IRIs, malformed IRIs, root type).
- [ ] Publish button disabled while there are errors, with a list that jumps
      to the offending entity and field.

## Phase 6 — GitHub publish ⬜

- [ ] Authentication. Pilot with a fine-grained personal access token
      (contents read/write on one repository) kept in `sessionStorage`. Then
      evaluate a GitHub App. Whether its device flow works from a browser
      without a proxy (CORS) must be verified first.
- [ ] Read the repository tree and `fdplight.json`.
- [ ] Publish as **one commit** with all changed files (Git data API: blobs,
      tree, commit, update ref). Commit message lists the entities changed.
- [ ] Conflict check. Compare the remote head with the head the project was
      loaded from. On mismatch, reload and show what changed, never force.
- [ ] "Propose changes" mode. Same commit on a new branch plus a pull request.
- [ ] First-publish helper. Create the repository if needed and explain how
      to enable Pages (or enable it through the API when the token allows).

## Phase 7 — Ping and Pages ⬜

- [ ] Generate `.github/workflows/fdp-ping.yml` (SPEC §7.2) and set the
      `FDP_INDEX_URL` / `FDP_ROOT_URL` repository variables.
- [ ] Verify in a pilot repository that `workflow_run` on
      `pages-build-deployment` fires after each Pages deployment.
- [ ] End-to-end pilot against **home.fairdatapoint.org** (the ERDERA VP Index
      needs authorization). Create, publish, wait for Pages, ping, then check
      `GET /index/entries/all` (state ACTIVE) and
      `GET /index/entries/{uuid}/data` (all entities harvested).
- [ ] Check whether `GET /index/entries/{uuid}` works for the pilot entry
      (it returns 500 for the WP13.3 entry).
- [ ] Show the Index status of the project in FDPlight (read-only, public
      endpoints).

## Phase 8 — Polish and docs ⬜

- [ ] i18n with Contour's mechanism and the same six locales.
- [ ] User guide for data stewards (create, fill in, publish, edit), with
      screenshots, in the style of Contour's data-steward guide.
- [ ] Bundled ERDERA profile, verified against the current ERDERA schemas and
      the VP Level 1 / Level 2 queries in WP13.3.
- [ ] Accessibility pass (keyboard tree navigation).

## Phase 9 — Optional ⬜

- [ ] Redirect mode UI and publishing (SPEC §2.4): storage base, generated
      w3id `.htaccess` rules, check that `{base}` resolves before publishing.
      The IRI rules themselves are in the Phase 1/3 core and tested in both
      modes.
- [ ] Profile documents at `{base}profile/{type}.ttl` (SPEC §8.1).
- [ ] VP Index authorization in the ping workflow, once the mechanism is
      documented.
- [ ] Bulk creation from CSV (overlaps with ejp-rd-vp/fdp-populator).

---

## Open decisions

See also SPEC §8.

1. ~~Packaging of the shared core (Phase 0).~~ Decided 2026-10-22: option (a),
   a `packages/record-core` workspace in the Contour repo.
2. ~~Licence of FDPlight.~~ Decided 2026-10-22: MIT, like Contour.
3. ~~Where FDPlight itself is hosted.~~ Decided 2026-10-22: GitHub Pages of
   this repository now, `fdplight.fairdatapoint.org` once DNS is set (item 6).
4. GitHub authentication beyond the pilot (Phase 6).
5. ~~Where the entity tree is stored.~~ Decided 2026-10-22: not stored,
   derived from the files on open (SPEC §4.1).
6. Custom domain for the app: `fdplight.fairdatapoint.org` once the DNS
   CNAME to `fairdatateam.github.io` exists.

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
