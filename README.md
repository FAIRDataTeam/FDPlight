<img src="src/assets/fdplight-icon.svg" alt="" width="72" align="right" />

# FDPlight

**a serverless FAIR Data Point**

FDPlight is a planned browser app for publishing a FAIR Data Point as plain
Turtle files on GitHub. Data stewards fill in forms generated from their
project's metadata schemas (SHACL). FDPlight writes one correctly wired file
per catalog, dataset or other resource, commits them to a GitHub repository
served by GitHub Pages, and adds a GitHub Action that pings the FDP Index so
the metadata gets harvested.

It is meant for partners who cannot run an FDP on their own servers, for
example in ERDERA, and replaces hand-written RDF files, which are error prone.

## What it does

- **Create.** Pick a profile (the FDP default, Software, or one imported from
  any running FDP), give the base URI where the files will be served, and build
  the tree FDP → catalogs → datasets, distributions or other resource types.
- **Edit.** Open an existing file-only FDP (made with FDPlight or by hand),
  edit it in the same forms and save it back. Triples FDPlight does not
  understand are kept.
- **Wire automatically.** Types, identifiers, timestamps, parent and child
  links and the LDP containers are generated, matching what the FDP reference
  implementation serves.
- **Validate.** SHACL checks per entity plus structural checks (dangling links,
  duplicate IRIs, root type) before anything is published.
- **Publish.** One commit per publish, or a pull request for review.
- **Get indexed.** A generated workflow pings the FDP Index after each Pages
  deployment and every few days.

## Status

Pilot. Creating, editing, importing, checking and publishing work end to end;
FDPlight publishes its own FDP from this repository (`metadata/`), listed on
home.fairdatapoint.org. The interface is in English, Portuguese, Dutch,
German, Spanish and French. Open items are in [TASKS.md](TASKS.md).

**Using it:** [the data-steward guide](docs/data-steward-guide.md).

**Developing it** (Vue 3, TypeScript, Vite single-file build):

```sh
npm install
npm run dev         # http://localhost:5174
npm run type-check
npm test
npm run build       # dist/index.html, one self-contained file
```

- [docs/SPEC.md](docs/SPEC.md) — exactly which files, IRIs and triples FDPlight
  generates, with the evidence behind each rule.
- [TASKS.md](TASKS.md) — the phased implementation plan.
- [docs/data-steward-guide.md](docs/data-steward-guide.md) — the user guide;
  its screenshots come from `scripts/shoot.cjs`.

Live (pilot): https://fdplight.fairdatapoint.org/

## Relation to Contour

[Contour](https://contour.fairdatapoint.org/) is the SHACL schema editor.
FDPlight is the publishing tool for the records those schemas describe. Both
share the same form, record, validation and lookup code (see TASKS.md,
Phase 0).

## Licence

[MIT](LICENSE).
