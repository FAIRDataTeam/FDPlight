# FDPlight

**A FAIR Data Point without a server.**

FDPlight is a planned browser app for publishing a FAIR Data Point as plain
Turtle files on GitHub. Data stewards fill in forms generated from their
project's metadata schemas (SHACL). FDPlight writes one correctly wired file
per catalog, dataset or other resource, commits them to a GitHub repository
served by GitHub Pages, and adds a GitHub Action that pings the FDP Index so
the metadata gets harvested.

It is meant for partners who cannot run an FDP on their own servers, for
example in ERDERA, and replaces hand-written RDF files, which are error prone.

## What it does

- **Create.** Pick a profile (the FDP default, ERDERA, or one imported from any
  running FDP), give the base URI where the files will be served, and build
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

Planning. Nothing is implemented yet.

- [docs/SPEC.md](docs/SPEC.md) — exactly which files, IRIs and triples FDPlight
  generates, with the evidence behind each rule.
- [TASKS.md](TASKS.md) — the phased implementation plan.

## Relation to Contour

[Contour](https://contour.fairdatapoint.org/) is the SHACL schema editor.
FDPlight is the publishing tool for the records those schemas describe. Both
share the same form, record, validation and lookup code (see TASKS.md,
Phase 0).

## Licence

[MIT](LICENSE).
