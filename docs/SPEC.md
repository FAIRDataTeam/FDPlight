# FDPlight — Specification of the generated RDF

Status: **draft v0.8** (2026-10-22). v0.2 adds automatic IRI modes (§2.2).
v0.3 corrects the timestamp predicates (§5.2, 5.3) and the literal forms of
the label and identifier, after checking the RI code and live RI output.
v0.4 pins metrics as metric/resource pairs and says which input triples the
wiring replaces (§5.7). v0.5: the entity tree is derived from the files
(§4.1). v0.6: repository folder, Index settings and the inline ping workflow
(§3.1, §4, §7.2); the bundled Software profile (§3.2). v0.7: opening FDPs
FDPlight did not make, keeping or migrating their IRIs (§4.2). v0.8: the RI
cross-check (9.5) and a correction of the RI's container IRIs (2.6).

This document pins down exactly which files, IRIs, containers and system
triples FDPlight writes for a file-only FAIR Data Point. The goal is that the
output is indistinguishable, for the FDP Index and for FDP clients, from what
the FAIR Data Point reference implementation (RI) serves, without anyone
writing a triple by hand.

Every rule below is traced to its source in the RI (FAIRDataTeam/FAIRDataPoint,
local checkout of 2026-09-28) or to an observation on a live system. See
[Evidence](#9-evidence).

---

## 1. Terms

| Term | Meaning |
|---|---|
| **Project** | One file-only FDP. One root entity plus its tree of children. Lives in one GitHub repository. |
| **Profile** | The FDPlight equivalent of the RI's *resource definitions*. It says which entity types exist, their URL prefix, target classes, SHACL schemas and child relations. |
| **Entity** | One metadata record (FDP root, a catalog, a dataset, …). One entity = one file. |
| **Base URI** | The URI prefix all entity IRIs derive from. Supplied by the user per project. |
| **IRI mode** | `file` (IRIs are the `.ttl` file URLs) or `redirect` (IRIs are extensionless and a redirector maps them to the files). Detected from the base URI, see 2.2. |
| **Storage base** | In redirect mode, the URL where the `.ttl` files are actually served (the GitHub Pages URL). In file mode it equals the base URI. |
| **System triples** | Triples the RI adds itself (types, identifiers, timestamps, links, LDP). FDPlight generates them and does not show them in the form. |

---

## 2. Base URI and IRI minting

### 2.1 The base URI is user supplied

Every project has one base URI, entered by the user when the project is
created. It must

- be an absolute `https` URI ending in `/`;
- be the place where the files will actually be served, because the FDP Index
  dereferences every entity IRI (HarvesterService `makeRequest`);
- stay stable. Entity IRIs are identifiers, so changing the base after
  publishing creates new identifiers (see 2.5).

Typical values

| Hosting | Example base URI |
|---|---|
| GitHub Pages, default domain | `https://erdera.github.io/my-fdp/` |
| GitHub Pages, custom domain | `https://fdp.example.org/` |
| Persistent prefix redirecting to Pages | `https://w3id.org/erdera/my-fdp/` |

FDPlight can propose the GitHub Pages base automatically from the target
repository (`https://{owner}.github.io/{repo}/`) but the user confirms it.

### 2.2 IRI mode, detected from the base URI

FDPlight picks the IRI mode from the host of the base URI.

| Base URI host | Mode |
|---|---|
| `*.github.io` | file |
| a custom domain equal to the target repository's Pages CNAME (GitHub API `GET /repos/{owner}/{repo}/pages`, field `cname`) | file |
| `w3id.org`, `purl.org` and other known redirectors | redirect |
| anything else | FDPlight asks the user once |

- The user can override the detected mode.
- The mode is stored in `fdplight.json` (`iriMode`, see 3.1).
- Switching mode after the first publish changes every IRI, so it goes
  through the warned re-base step (2.5).

### 2.3 Entity IRIs

| | file mode | redirect mode |
|---|---|---|
| root entity | `{base}fdp.ttl` | `{base}` |
| child entity | `{base}{urlPrefix}/{id}.ttl` | `{base}{urlPrefix}/{id}` |
| file in the repository | `fdp.ttl`, `{urlPrefix}/{id}.ttl` | the same |
| file served at | the entity IRI | `{storage}fdp.ttl`, `{storage}{urlPrefix}/{id}.ttl` |

- `{urlPrefix}` comes from the profile (`catalog`, `dataset`, `distribution`,
  or project specific ones such as `biobank`).
- `{id}` is minted when the entity is created. Default is a short random id
  (8 lowercase base32 characters, `a-z2-7`). The user may replace it with a
  slug (`[a-z0-9][a-z0-9-]*`) before the first publish. After the first
  publish it is locked.
- Files keep their `.ttl` names in both modes. In file mode the file path
  equals the IRI path relative to the base, so the IRI is always resolvable
  once Pages has deployed.

**Why the `.ttl` extension.** GitHub Pages picks the content type from the
extension. A `.ttl` file is served as `text/turtle; charset=utf-8` (verified).
A file without an extension is served as `application/octet-stream`
(verified). The Index currently parses everything as Turtle anyway (see the
note in 9.3) but other clients would not.

### 2.4 Redirect mode

Redirect mode needs a second URI, the **storage base** `{storage}` (absolute
`https`, ending in `/`), normally `https://{owner}.github.io/{repo}/`.

- FDPlight generates the w3id `.htaccess` rules, roughly

  ```apache
  RewriteEngine on
  RewriteRule ^$      {storage}fdp.ttl [R=302,L]
  RewriteRule ^(.+)$  {storage}$1.ttl  [R=302,L]
  ```

  relative to the directory of `{base}` in the w3id repository.
- Before publishing, FDPlight checks that `{base}` resolves to the root file.
  w3id changes go through a reviewed pull request, so the IRIs work only
  after it is merged. Until then publishing warns.
- The Index follows w3id redirects at every level. home.fairdatapoint.org
  has ACTIVE entries `https://w3id.org/duchenne-fdp` and
  `https://w3id.org/simpathic/fdp` whose harvested data contains catalogs
  and other children under their w3id IRIs (see 9.2).

### 2.5 Changing the base URI

- Before the first publish, FDPlight re-bases every IRI in the project
  silently.
- After the first publish, re-basing is an explicit action with a warning. All
  IRIs are rewritten and the old root URL should keep being pinged until it is
  removed from the Index.
- Changing the IRI mode is a re-base.

### 2.6 Derived IRIs inside an entity file

All of these are hash IRIs on the entity IRI, so they can never collide with
another file's IRIs.

| Node | IRI | RI source |
|---|---|---|
| Metadata identifier | `{entity}#identifier` | `MetadataEnhancer.createMetadataIdentifier` |
| Access rights | `{entity}#accessRights` | `MetadataEnhancer.enhance` |
| LDP container per child type | file mode `{entity}#{childPrefix}`, redirect mode `{entity}/{childPrefix}/` | `MetadataEnhancer.enhanceWithLinks`, called with `persistentUrl`: `{persistentUrl}/{childPrefix}/`, the same IRI for every parent (9.5) |
| Publisher (when entered inline) | `{entity}#publisher` | the RI keeps a posted blank node; its factory-default root uses `#publisher` (9.5, 5.6) |
| Contact point (when entered inline) | `{entity}#contactPoint` | not in RI, see 5.6 |
| FAIR metrics | `{entity}/metrics/{md5Hex(metricUri)}`; for a redirect-mode root (`E` ends with `/`) the slash is not doubled | `MetricsMetadataService` |

**Container IRIs are always per parent entity.** The WP13.3 example declares
`…/catalog/datasets/` in both the catalog and the dataset file and after
harvesting the two merge into one container with two member relations and
two membership resources (observed, see 9.4). The RI does the same whenever an
FDP has two catalogs: it names every catalog's dataset container
`{persistentUrl}/dataset/` (verified, 9.5). Deriving the container IRI from
the parent entity IRI makes that impossible, and is a deliberate difference
from the RI.

In file mode `{entity}/{childPrefix}/` would give
`…/catalog/abc.ttl/dataset/`, which is legal but odd, hence the hash form.
Redirect mode IRIs have no extension, so that form is used there. For the
root in redirect mode (`E = {base}`) the container is `{base}{childPrefix}/`,
exactly as the RI serves it. Containers are never dereferenced by the Index
(it reads them from the parent's own graph), so either form works for
harvesting.

---

## 3. The profile

The profile mirrors the RI's resource definitions so a profile can be
**imported from any running FDP** with two public calls (both verified on
home.fairdatapoint.org)

- `GET /resource-definitions` gives names, URL prefixes, target classes,
  schema UUIDs and children (relation URI, list title).
- `GET /{urlPrefix}/spec` (Accept `text/turtle`) gives the merged SHACL for
  that type, including the schemas it extends (`GenericController.getFormMetadata`).
  The root type uses `GET /spec`.

### 3.1 Format (JSON, stored in the repository as `fdplight.json`)

```json
{
  "fdplight": "0.1",
  "name": "ERDERA Level 1",
  "base": "https://erdera.github.io/my-fdp/",
  "iriMode": "file",
  "storageBase": null,
  "defaults": {
    "language": "http://id.loc.gov/vocabulary/iso639-1/en",
    "license": null,
    "accessRightsDescription": "This resource has no access restriction",
    "metrics": [
      { "metric": "https://purl.org/fair-metrics/FM_F1A", "resource": "https://www.ietf.org/rfc/rfc3986.txt" }
    ]
  },
  "types": [
    {
      "key": "fdp",
      "name": "FAIR Data Point",
      "urlPrefix": "",
      "targetClasses": [
        "https://w3id.org/fdp/fdp-o#MetadataService",
        "http://www.w3.org/ns/dcat#DataService",
        "http://www.w3.org/ns/dcat#Resource",
        "https://w3id.org/fdp/fdp-o#FAIRDataPoint"
      ],
      "shapes": "shapes/fdp.ttl",
      "children": [
        { "type": "catalog", "relation": "https://w3id.org/fdp/fdp-o#metadataCatalog", "title": "Catalogs" }
      ]
    },
    {
      "key": "catalog",
      "name": "Catalog",
      "urlPrefix": "catalog",
      "targetClasses": ["http://www.w3.org/ns/dcat#Resource", "http://www.w3.org/ns/dcat#Catalog"],
      "shapes": "shapes/catalog.ttl",
      "children": [
        { "type": "dataset", "relation": "http://www.w3.org/ns/dcat#dataset", "title": "Datasets" }
      ]
    }
  ]
}
```

- `iriMode` is `"file"` or `"redirect"` (2.2). `storageBase` is required in
  redirect mode and must be `null` or absent in file mode.
- Exactly one type has `urlPrefix: ""`. It is the root (RI `isRoot()`).
- `shapes` points to the merged SHACL for the type, stored in the
  repository so a project is self-contained. It may also be a URL.
- `source` (optional) records where the profile was imported from, so it can
  be refreshed.
- `folder` (optional, default `""`) is the repository folder that holds the
  FDP, ending with `/` (e.g. `"metadata/"`). See 4.
- `index` (optional) is `{ "url": "https://home.fairdatapoint.org",
  "pagesWorkflow": "pages-build-deployment" }`: the Index to ping and the
  name of the workflow that deploys Pages. Without it no ping workflow is
  written. See 7.2.
- `root` (optional) is the root file when it is not `fdp.ttl`, for an FDP
  imported with its own IRIs (4.2).

The values in the example are those currently served by home.fairdatapoint.org.

### 3.2 Bundled profiles

- **FDP default** (FDP → Catalog → Dataset → Distribution), as above.
- **Software** (FDP → Catalog → Software → Software source code). Root and
  catalog as in the FDP default; Software is `schema:SoftwareApplication`,
  source code `schema:SoftwareSourceCode` (schema.org, as CodeMeta), both
  also `dcat:Resource` so the generic Resource shape applies. Relations:
  Catalog → Software `dcat:resource` (DCAT 3), Software → source code
  `schema:hasPart`. Shapes under `https://fdplight.fairdatapoint.org/shapes/`.
  Used for FDPlight's own FDP.
- **ERDERA / EJP RD VP**, from the ERDERA FDP reference configuration
  (Catalog children such as Dataset, Biobank, Patient registry, Guideline,
  Data service). To be confirmed against the current ERDERA schemas.

---

## 4. Files and repository layout

```
/fdplight.json                      project profile and settings
/shapes/{type}.ttl                  merged SHACL per type
/fdp.ttl                            root entity
/{urlPrefix}/{id}.ttl               one file per child entity
/.github/workflows/fdp-ping.yml     ping workflow (section 7)
/README.md                          generated, links to the root and the Index entry
/w3id/.htaccess                     redirect mode only, to copy into the w3id PR
```

- With a `folder` (3.1), every path above except the workflow is inside it
  (`metadata/fdp.ttl`, `metadata/catalog/{id}.ttl`, `metadata/fdplight.json`,
  …), and the base URI points at that folder. The workflow stays in
  `.github/workflows/`, where GitHub looks for it. FDPlight deletes only
  entity files inside the folder.
- One entity per file. Each file is the complete graph the RI would serve for
  that entity (its metadata, its system triples, its LDP containers).
- Files are written as clean Turtle with the prefixes actually used, from a
  fixed list (`NS` in `src/core/vocab.ts`; `ejp:` for the EJP RD / ERDERA
  vocabulary since 2026-10-22). Other IRIs are written in full.
- FDPlight never writes outside these paths, so the repository can also hold
  other content.

### 4.1 The entity tree is derived from the files

The tree is **not stored** in `fdplight.json`. It is rebuilt every time a
project is opened (decided 2026-10-22), because every file carries both
directions of the tree:

- **down**: the parent's LDP containers (`ldp:contains`) and direct relations
  (5.5);
- **up**: the child's `dct:isPartOf` (5.2).

Rules

- Starting from any entity file, FDPlight follows `dct:isPartOf` up to the
  root, then the containers down. Without containers it falls back to the
  child relations of the profile, as the Index harvester does (9.1).
- Each entity's type is the profile type whose `targetClasses` all appear in
  its `rdf:type`, choosing the type with most matching classes. An entity
  whose types match no profile type is reported.
- Children are listed by `dct:title` (English first, as for `rdfs:label`),
  then by id. RDF has no order, so no manual order is kept.
- When the two directions disagree (only possible in hand-edited files), the
  **containers win**, because the Index follows them. The disagreement is
  reported and the next save writes both directions consistently.
- `fdp:metadataIssued` is read back from each file, so `issued` survives
  re-opening (5.2).
- The crawl starts at the root file and follows the parent's containers,
  else its child relations, as the Index harvester does. A child's type is
  the one its parent's relation implies.
- Blank nodes are written with canonical labels (`_:b0`, …) derived from
  their content, so re-opening and saving an unchanged file writes the same
  text and its `fdp:metadataModified` does not change.

### 4.2 FDPs that FDPlight did not make

A repository with an FDP but no `fdplight.json` is imported from its root
file (decided 2026-10-22: the user chooses the mode per import).

- The folder is the root file's folder, the base URI the root IRI minus the
  file name. The root must be a subject typed `fdp:MetadataService`,
  `fdp:FAIRDataPoint` or `r3d:Repository` whose IRI ends with the file name.
- **Keep** (default): every imported entity keeps its IRI and file
  (`eprovide_catalog.ttl`); `fdplight.json` records `root`. New entities use
  the normal layout. Ids of imported entities cannot change.
- **Migrate**: entities move to `{urlPrefix}/{id}.ttl` with ids from their
  old file names; every old IRI (and its hash IRIs, and literals equal to an
  old IRI) is rewritten. The old files are left in the repository and
  reported.
- No default language or licence is added to imported entities.
- The first save fixes the hand-written wiring (9.4): one container per
  parent, identifier nodes of the entity at any IRI replaced by
  `E#identifier`, `ldp:BasicContainer` / `ldp:contains` on the entity
  removed, `dct:isPartOf` added. Everything else is kept (5.7).
- The import report names the hand-written wiring the save replaces: a
  container IRI declared in several files for different parents, and an
  identifier node that is not the one `fdp:metadataIdentifier` points to (or
  a `fdp:metadataIdentifier` the file does not describe). Per file it counts
  the triples read into the form, regenerated, and kept as they are. A kept
  triple identical to one FDPlight adds anyway (the default access rights,
  `dct:conformsTo` the profile) counts as regenerated.

---

## 5. Triples per entity

Notation. `E` is the entity IRI, `P` the parent IRI, `T` the entity type from
the profile.

### 5.1 User metadata

Whatever the form for `T` produces from the SHACL shapes, with subject `E`.
Nested `sh:node` values follow 5.3.

### 5.2 System triples (all entities)

| Triple(s) | Rule | RI source |
|---|---|---|
| `E rdf:type C` for every `C` in `T.targetClasses` | always | `enhance` → `setRdfTypes` |
| `E fdp:metadataIdentifier E#identifier` | always | `enhance` → `setMetadataIdentifier` |
| `E#identifier a datacite:Identifier ; dct:identifier "E"` (plain string literal) | always | `createMetadataIdentifier` (`l(uri)`) |
| `E rdfs:label "…"`, one plain literal (no language tag) with the lexical form of a `dct:title` of `E`. With several titles FDPlight takes the first English one, else the first in code-point order | when a title exists | `enhance` → `setLabel(getTitle)`, `l(Value)` drops the tag. The RI takes the first title in model order |
| `E dct:language defaults.language` | only when the user gave none and a default is set | `enhance` |
| `E dct:license defaults.license` | only when the user gave none and a default is set | `enhance` |
| `E dct:accessRights E#accessRights` and `E#accessRights a dct:RightsStatement ; dct:description "…"` | only when the user gave none | `enhance` → `setAccessRights` |
| `E fdp:metadataIssued t0` (`xsd:dateTime`) | `t0` = first save, never changed | `enhance` → `setIssued`, which writes `fdp:metadataIssued`. `enhance(…, oldMetadata)` keeps the old value |
| `E fdp:metadataModified t` (`xsd:dateTime`) | `t` = every save | `enhance` → `setModified`, which writes `fdp:metadataModified` |
| `E dct:isPartOf P` | every non-root entity | used by the RI to find the parent (`GenericController`, `MetadataSetter`) and in the Index navigation shapes |
| `E dct:conformsTo {profileIRI(T)}` and `{profileIRI(T)} rdfs:label "{T.name} Profile"` | always | `enhanceWithResourceDefinition` |
| `E sio:SIO_000628 M` and `M sio:SIO_000628 r ; sio:SIO_000332 r` for each configured metric `{metric, resource: r}`, with `M` named after `metric` (2.6) | only when `defaults.metrics` is non-empty | `enhance` → `setMetrics`; RI settings entries are `(metricUri, resourceUri)` |

`profileIRI(T)` is `{base}profile/{T.key}.ttl` in file mode and
`{base}profile/{T.key}` in redirect mode. Publishing a profile document
there is an open decision (see 8).

### 5.3 Catalog-only triples

For the type with `urlPrefix: "catalog"` (RI `isCatalog()`), also
`dct:issued t0` and `dct:modified t`, with the same values and rules as
`fdp:metadataIssued` and `fdp:metadataModified`. The RI overwrites any value
the user entered (`setMetadataIssued` / `setMetadataModified`, which write
`dct:issued` / `dct:modified`), so FDPlight hides these two fields in the
catalog form.

For every other type `dct:issued` and `dct:modified` are **user metadata**:
the default shapes declare them as form fields for datasets and
distributions, where they describe the data, not the metadata record
(see 9.2).

Note the RI's method names are the reverse of the predicates they write
(`MetadataSetter.setIssued` → `fdp:metadataIssued`,
`setMetadataIssued` → `dct:issued`).

### 5.4 Root-only triples

| Triple | Value | RI equivalent |
|---|---|---|
| `E fdp:fdpSoftwareVersion` | `"FDPlight:{version}"` | `"FDP:{version}"` |
| `E dcat:endpointURL` | `E` | the FDP's persistent URL |
| `E dcat:endpointDescription` | omitted, there is no API to describe | api-docs and swagger URLs |

The root's target classes include `fdp:MetadataService`. The Index needs one
of `r3d:Repository` or `fdp:MetadataService` as an explicit `rdf:type` on the
root to read its title, description, version, publisher name and country
(`MetadataRetrievalUtils.findRepository`, exact match, no subclass reasoning).

### 5.5 Child links and LDP containers

For every child relation `R` of `T` (from the profile), with child type `T'`
and children `c1 … cn` of `E` of type `T'`

```turtle
E  R  c1, … , cn .                                   # direct relation

<E#{T'.urlPrefix}> a ldp:DirectContainer ;           # one container per child type
    dct:title "{list title}" ;
    ldp:membershipResource E ;
    ldp:hasMemberRelation R ;
    ldp:contains c1, … , cn .
```

- The container is emitted even when it is empty (`n = 0`), as the RI does,
  so clients can see which child types are allowed.
- Both the relation triples and the container are **recomputed from the
  project tree on every save**. Users never edit them. Adding, moving or
  deleting a child rewrites the parent file.
- Moving an entity to another parent keeps its file and IRI, which depend
  on its type and id only, so it is allowed after publishing. The save
  rewrites the old parent, the new parent and the entity's `dct:isPartOf`.
- `ldp:BasicContainer` on the entity itself (as in the WP13.3 files) is
  **not** emitted because the RI does not produce it.
- Any LDP container node found in the input (other than `E` itself) is
  wiring and is dropped, whatever its IRI, so hand-written containers such as
  the shared one in 9.4 cannot survive a save.

### 5.6 Nested nodes from the form

- A nested `sh:node` value that has its own identity (publisher, contact
  point) gets a hash IRI on the entity (`E#publisher`, `E#contactPoint`, then
  `E#publisher-2`, … for repeats).
- Other nested values stay blank nodes, as Contour does today.

The hash IRI for the publisher is a deliberate choice. The Index entry for the
WP13.3 FDP (blank node publisher) returns HTTP 500 on its detail endpoint.
That the blank node is the cause is a hypothesis to confirm in the server
logs, but a hash IRI costs nothing and matches the static-fdp template.

### 5.7 Triples FDPlight does not understand

When an existing file is imported (edit use case), triples that neither the
form nor the system rules account for are **kept and written back
unchanged** on the same subject. FDPlight reports how many there are. They are
never dropped silently.

What the wiring **replaces** in its input, and so never counts as unknown

- on `E`: `rdf:type`, `fdp:metadataIdentifier`, `rdfs:label`,
  `fdp:metadataIssued`, `fdp:metadataModified`, `dct:isPartOf`,
  `sio:SIO_000628`, `ldp:contains` (a hand-made `ldp:BasicContainer` on the
  entity), every child relation of `T`, for catalogs `dct:issued` and
  `dct:modified`, for the root `fdp:fdpSoftwareVersion` and
  `dcat:endpointURL`;
- the nodes `E#identifier`, any other `datacite:Identifier` node whose
  `dct:identifier` is `E` (e.g. a hand-written typo of its IRI), the generated
  containers, any other LDP container (5.5), the metric nodes `E/metrics/…`, and `E#accessRights` when
  the user gave no `dct:accessRights`.

`dct:conformsTo`, `dct:language`, `dct:license` and `dct:accessRights` given
by the user are kept; the defaults only fill gaps.

---

## 6. Validation before publish

FDPlight refuses to publish (or asks for confirmation, where marked) when

1. any entity fails the SHACL check of its type (Contour's built-in checks
   plus the full SHACL Core check with shacl-engine);
2. any IRI is not under the base URI (confirmation);
3. any `ldp:contains` / relation target has no file in the project;
4. any entity other than the root lacks a parent;
5. two entities share an IRI, or two containers share an IRI;
6. any IRI in the project is malformed, including the hash IRIs;
7. the root lacks `fdp:MetadataService` or `r3d:Repository` as a type.

Rules 3 to 6 are the classes of hand-written errors seen in the WP13.3 files
(shared container IRI, the `eprovide_disribution.ttl#identifier` typo).

---

## 7. Publishing and the Index ping

### 7.1 Save to GitHub

- Each publish is **one commit** containing every changed file (Git data API:
  blobs, tree, commit, non-forced ref update), with a generated message
  listing the entities added, updated and removed.
- `fdp:metadataModified` changes only for entities whose file content
  changes; this includes parents whose children were added or removed.
- Entity files that are no longer in the project are deleted, but only
  `fdp.ttl` and `{urlPrefix}/*.ttl` for the profile's prefixes.
- Optional **"propose changes"** mode: the same commit goes on a new branch
  `fdplight/{yyyymmdd-hhmmss}` (UTC) created at the head FDPlight read, and a
  pull request into the project's branch carries the commit message. The
  project's branch is not written, so no conflict check applies; GitHub
  shows any conflict in the pull request. Entities in the proposal count as
  published for id locking (2.3). The token also needs *Pull requests:
  read and write*.
- FDPlight checks that the branch head is still the commit it read before
  writing (and updates the ref without force), so a concurrent edit is
  detected, never overwritten.

### 7.2 Ping workflow

When the project has `index` settings (3.1), FDPlight writes
`.github/workflows/fdp-ping.yml` on every publish, with the Index URL and the
root IRI **inline** (decided 2026-10-22: regenerating the file keeps them
current, and the token needs no Variables permission). It pings after every
successful run of the Pages workflow, on a schedule, and on demand.

```yaml
name: Ping FDP Index
on:
  workflow_run:
    workflows: ["{index.pagesWorkflow}"]   # pages-build-deployment, or the repo's own deploy workflow
    types: [completed]
  schedule:
    - cron: "17 3 */3 * *"     # every 3 days, the Index marks an FDP inactive after a week
  workflow_dispatch:
permissions: {}
jobs:
  ping:
    if: github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success'
    runs-on: ubuntu-latest
    steps:
      - name: Ping {index.url}
        env:
          INDEX_URL: "{index.url}"
          ROOT_URL: "{root IRI}"
        run: |
          curl --fail -sS -X POST "$INDEX_URL" \
            -H 'Content-Type: application/json' \
            -d "{\"clientUrl\": \"$ROOT_URL\"}"
```

- `pagesWorkflow` is `pages-build-deployment` when Pages deploys from a
  branch, or the name of the repository's own workflow when Pages deploys
  with GitHub Actions (FDPlight's own repository: "Deploy to GitHub Pages").
- Writing a workflow file needs the token's **Workflows** permission in
  addition to Contents.
- The values are validated so they cannot break out of the YAML or the shell
  (https URLs without quotes, `$` or backticks).
- Indexes that need authorization (the ERDERA VP Index) get a secret and an
  extra header once the mechanism is known.
- The ping payload and the 204 response are verified against
  home.fairdatapoint.org (v1.22.1). The Index accepts only
  `application/json` (`IndexPingController`), not the form-encoded variant
  documented in the static-fdp README.
- The `workflow_run` trigger is verified (pilot in FDPlight's own repository,
  9.2).

---

## 8. Open decisions

1. **Profile document.** What, if anything, is served at `profileIRI(T)`.
   Options are nothing (as WP13.3), the merged SHACL, or a PROF description
   like the RI.
2. ~~**Container IRI form in file mode.**~~ Decided 2026-10-22: hash
   (`E#dataset`) in file mode, RI style (`E/dataset/`) in redirect mode (2.6).
3. **Default metrics.** Emit none (proposed) or mirror the RI defaults.
4. **ERDERA specifics.** `ejp:vpConnection ejp:VPDiscoverable` and
   `fdp:conformsToFdpSpec` appear in the WP13.3 files. Decide whether they are
   form fields (from the ERDERA shapes) or system triples of the ERDERA
   profile.
5. **Redirect mode timing.** The rules are specified (2.2 to 2.4). The
   implementation stays in Phase 9 unless a pilot needs it earlier.

---

## 9. Evidence

### 9.1 RI code (FAIRDataTeam/FAIRDataPoint, commit of 2026-09-28)

- `rdf/metadata/MetadataEnhancer.java` — system triples (`enhance`), LDP
  containers (`enhanceWithLinks`), profile and root triples
  (`enhanceWithResourceDefinition`).
- `rdf/metadata/MetricsMetadataService.java` — metric IRIs.
- `resource/ResourceDefinition.java` — `isRoot()` (empty prefix),
  `isCatalog()` (prefix `catalog`).
- `rdf/metadata/GenericController.java` — `/spec` returns merged SHACL,
  parent via `dct:isPartOf`.
- `index/IndexPingController.java` — `POST /`, JSON `{"clientUrl"}`, 204, rate
  limited per IP and per URL.
- `index/entry/HarvesterService.java` — GET with `Accept: text/turtle`,
  follows `ldp:DirectContainer`/`ldp:contains` when present, otherwise the
  navigation shapes in `defaultNavigationShacl.ttl` (`fdp:metadataCatalog`,
  `dcat:dataset`, `dcat:distribution`, `dct:isPartOf`, `r3d:dataCatalog`).
- `index/event/MetadataRetrievalUtils.java` — root must be typed
  `r3d:Repository` or `fdp:MetadataService`.

### 9.2 Live checks on 2026-10-22

- home.fairdatapoint.org runs FDP `v1.22.1~1b70362`.
- `GET /resource-definitions`, `GET /metadata-schemas` and `GET /catalog/spec`
  answer 200 without authentication.
- GitHub Pages serves `.ttl` as `text/turtle; charset=utf-8` and files
  without extension as `application/octet-stream`.
- The Index follows w3id redirects. ACTIVE entries
  `https://w3id.org/duchenne-fdp` and `https://w3id.org/simpathic/fdp` have
  harvested data (`GET /index/entries/{uuid}/data`) with catalogs and other
  children under their w3id IRIs.
- Timestamps as served by RIs. The home.fairdatapoint.org root has
  `fdp:metadataIssued` / `fdp:metadataModified` and no `dct:issued`. A
  catalog on fdp.lumc.nl has `dct:issued` = `fdp:metadataIssued`; a dataset
  there has `fdp:metadataIssued` 2025-04-08 and a user entered
  `dct:issued` 2024-02-04.
- The default shapes (`/catalog/spec`, `/dataset/spec`,
  `/distribution/spec`) all declare `dct:issued` and `dct:modified`; the
  root spec declares `fdp:metadataIssued`, `fdp:metadataModified` and
  `fdp:metadataIdentifier`.
- api.github.com allows browser publishing: a CORS preflight from
  `https://fdplight.fairdatapoint.org` for `PATCH` with `Authorization`,
  `Content-Type` and `X-GitHub-Api-Version` returns 204 with
  `access-control-allow-origin: *` and those headers allowed.
- **Pilot, FDPlight's own FDP** (Software profile, 4 entities under
  `https://fdplight.fairdatapoint.org/metadata/`, published by
  `scripts/publish-own-fdp.ts` in commit a36180c). Pages served every file as
  `text/turtle; charset=utf-8`; the generated ping workflow fired on
  `workflow_run` after the "Deploy to GitHub Pages" workflow and succeeded;
  home.fairdatapoint.org registered the entry ACTIVE (uuid
  `85acf112-1ef7-4cbc-8fcb-018411428164`) and its data contains all four
  entities. `GET /index/entries/{uuid}` returns 200 with title, publisher name
  (from the `E#publisher` hash node), description and version.
- home.fairdatapoint.org allows browser access to `/index/entries/all`
  (`access-control-allow-origin: *`).
- GitHub sign-in through an OAuth or GitHub App **device flow does not work
  from the browser** (checked 2026-10-22 with `Origin:
  https://fdplight.fairdatapoint.org`). `POST
  https://github.com/login/device/code` returns 200 with a device code but no
  `Access-Control-Allow-Origin`, and the `OPTIONS` preflight returns 404, so
  the page cannot read the response. The same holds for
  `/login/oauth/access_token`. A GitHub App would need a token proxy.
- Importing a profile works from the browser (checked 2026-10-22 on
  home.fairdatapoint.org with `Origin: https://fdplight.fairdatapoint.org`):
  `/resource-definitions` (JSON) and `/spec`, `/catalog/spec` (with
  `Accept: text/turtle`) return 200 with `access-control-allow-origin: *`.
  Without that `Accept` header `/spec` returns 406.
- Pinging the WP13.3 root returned 204, the entry went from INACTIVE to
  ACTIVE, and `GET /index/entries/{uuid}/data` returned the root, catalog,
  dataset and distribution (147 lines of Turtle).

### 9.3 RI issue noticed

`HarvesterService.makeRequest` passes `getContentType().getType()` (only the
main type, e.g. `text`) to `HttpUtil.getRdfContentType`, which expects the
full media type. Every harvested page is therefore parsed as Turtle. FDPlight
only writes Turtle, so it is unaffected.

### 9.4 Problems observed in hand-written files (ERDERA/WP13.3_document_based_fdp)

- Container `…/proqolid/catalog/datasets/` declared in two files, merged after
  harvesting into one container with `ldp:hasMemberRelation dcat:dataset,
  dcat:distribution` and two membership resources.
- Identifier subject `eprovide_disribution.ttl#identifier` (typo) does not
  match the distribution IRI.
- `GET /index/entries/{uuid}` for this entry returns HTTP 500 while other
  entries return 200. Still 500 on 2026-10-22, while FDPlight's pilot entry,
  with a hash-IRI publisher, returns 200: consistent with the blank-node
  publisher being the cause, not proof.

### 9.5 Cross-check against the RI (2026-10-22)

`scripts/ri-crosscheck.ts` builds the same tree (root, catalog, dataset,
distribution) from the same user metadata in a local RI 1.22.0
(`fairdata/fairdatapoint:1.22`, GraphDB, pinging disabled,
`scripts/ri-check/`) through its API, and in FDPlight through `planPublish`
with the RI's default metrics. It compares each entity's graph after
replacing entity IRIs, container IRIs (named by membership resource and
relation), profile IRIs, timestamps and the software version.

Result: **128 triples identical** (34 root, 34 catalog, 34 dataset, 26
distribution): types, label, identifier node, access rights, licence and
language as given, `dct:conformsTo` and profile label, metric nodes, parent
and child links, containers with `ldp:contains`, catalog `dct:issued` /
`dct:modified`, the user's dataset `dct:issued`, the root's
`fdp:fdpSoftwareVersion` and `dcat:endpointURL`. The only differences:

- **Publisher.** Posted as a blank node, the RI keeps the blank node;
  FDPlight writes `E#publisher` (5.6, by design). The RI's own factory-default
  root also uses `#publisher`.
- **`dcat:endpointDescription`** on the RI root (its OpenAPI and Swagger
  pages). FDPlight has no API, so it writes none.

Container IRIs differ by design (2.6): the RI served `http://localhost:8190/dataset/`
as the dataset container of the catalog, an IRI every catalog would share.
