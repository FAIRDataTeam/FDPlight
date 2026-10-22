# FDPlight — Specification of the generated RDF

Status: **draft v0.1** (2026-10-22)

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
  publishing creates new identifiers (see 2.4).

Typical values

| Hosting | Example base URI |
|---|---|
| GitHub Pages, default domain | `https://erdera.github.io/my-fdp/` |
| GitHub Pages, custom domain | `https://fdp.example.org/` |
| Persistent prefix redirecting to Pages | `https://w3id.org/erdera/my-fdp/` |

FDPlight can propose the GitHub Pages base automatically from the target
repository (`https://{owner}.github.io/{repo}/`) but the user confirms it.

### 2.2 Entity IRIs (file mode, default)

```
root entity        {base}fdp.ttl
child entity       {base}{urlPrefix}/{id}.ttl
```

- `{urlPrefix}` comes from the profile (`catalog`, `dataset`, `distribution`,
  or project specific ones such as `biobank`).
- `{id}` is minted when the entity is created. Default is a short random id
  (e.g. 8 base32 characters). The user may replace it with a slug before the
  first publish. After the first publish it is locked.
- The file path in the repository equals the IRI path relative to the base,
  so the IRI is always resolvable once Pages has deployed.

**Why the `.ttl` extension.** GitHub Pages picks the content type from the
extension. A `.ttl` file is served as `text/turtle; charset=utf-8` (verified).
A file without an extension is served as `application/octet-stream`
(verified). The Index currently parses everything as Turtle anyway (see the
note in 9.3) but other clients would not.

### 2.3 Entity IRIs (redirect mode, optional)

When the base is a redirecting prefix such as w3id, IRIs can drop the
extension (`{base}catalog/{id}`) and the redirect rules map them to the
`.ttl` files. FDPlight then also generates the redirect rules (`.htaccess`
for w3id). This is a later phase and not required for ERDERA pilots.

### 2.4 Changing the base URI

- Before the first publish, FDPlight re-bases every IRI in the project
  silently.
- After the first publish, re-basing is an explicit action with a warning. All
  IRIs are rewritten and the old root URL should keep being pinged until it is
  removed from the Index.

### 2.5 Derived IRIs inside an entity file

All of these are hash IRIs on the entity IRI, so they can never collide with
another file's IRIs.

| Node | IRI | RI source |
|---|---|---|
| Metadata identifier | `{entity}#identifier` | `MetadataEnhancer.createMetadataIdentifier` |
| Access rights | `{entity}#accessRights` | `MetadataEnhancer.enhance` |
| LDP container per child type | `{entity}#{childPrefix}` (file mode) or `{entity}/{childPrefix}/` (redirect mode) | `MetadataEnhancer.enhanceWithLinks` uses `{entity}/{childPrefix}/` |
| Publisher (when entered inline) | `{entity}#publisher` | not in RI, see 5.3 |
| Contact point (when entered inline) | `{entity}#contactPoint` | not in RI, see 5.3 |
| FAIR metrics | `{entity}/metrics/{md5(metricUri)}` | `MetricsMetadataService` |

**Container IRIs are always per parent entity.** The WP13.3 example declares
`…/catalog/datasets/` in both the catalog and the dataset file and after
harvesting the two merge into one container with two member relations and
two membership resources (observed, see 9.4). Deriving the container IRI from
the parent entity IRI makes that impossible.

In file mode the RI pattern `{entity}/{childPrefix}/` would give
`…/catalog/abc.ttl/dataset/`, which is legal but odd, hence the hash form.
Containers are never dereferenced by the Index (it reads them from the
parent's own graph), so either form works for harvesting.

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
  "defaults": {
    "language": "http://id.loc.gov/vocabulary/iso639-1/en",
    "license": null,
    "accessRightsDescription": "This resource has no access restriction",
    "metrics": []
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

- Exactly one type has `urlPrefix: ""`. It is the root (RI `isRoot()`).
- `shapes` points to the merged SHACL for the type, stored in the
  repository so a project is self-contained. It may also be a URL.
- `source` (optional) records where the profile was imported from, so it can
  be refreshed.

The values in the example are those currently served by home.fairdatapoint.org.

### 3.2 Bundled profiles

- **FDP default** (FDP → Catalog → Dataset → Distribution), as above.
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
```

- One entity per file. Each file is the complete graph the RI would serve for
  that entity (its metadata, its system triples, its LDP containers).
- Files are written as clean Turtle with the prefixes actually used.
- FDPlight never writes outside these paths, so the repository can also hold
  other content.

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
| `E#identifier a datacite:Identifier ; dct:identifier "E"` | always | `createMetadataIdentifier` |
| `E rdfs:label (dct:title of E)` | when a title exists | `enhance` → `setLabel` |
| `E dct:language defaults.language` | only when the user gave none and a default is set | `enhance` |
| `E dct:license defaults.license` | only when the user gave none and a default is set | `enhance` |
| `E dct:accessRights E#accessRights` and `E#accessRights a dct:RightsStatement ; dct:description "…"` | only when the user gave none | `enhance` → `setAccessRights` |
| `E dct:issued t0` | `t0` = first save, never changed | `enhance(…, oldMetadata)` keeps the old value |
| `E dct:modified t` | `t` = every save | `enhance` |
| `E dct:isPartOf P` | every non-root entity | used by the RI to find the parent (`GenericController`, `MetadataSetter`) and in the Index navigation shapes |
| `E dct:conformsTo {profileIRI(T)}` and `{profileIRI(T)} rdfs:label "{T.name} Profile"` | always | `enhanceWithResourceDefinition` |
| `E sio:SIO_000628 M` and `M sio:SIO_000628 m ; sio:SIO_000332 m` for each configured metric `m` | only when `defaults.metrics` is non-empty | `enhance` → `setMetrics` |

`profileIRI(T)` is `{base}profile/{T.key}.ttl`. Publishing a profile document
there is an open decision (see 8).

### 5.3 Catalog-only triples

For the type with `urlPrefix: "catalog"` (RI `isCatalog()`), also
`fdp:metadataIssued` and `fdp:metadataModified`, with the same rules as
`dct:issued` and `dct:modified`.

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
- `ldp:BasicContainer` on the entity itself (as in the WP13.3 files) is
  **not** emitted because the RI does not produce it.

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

- Each publish is **one commit** containing every changed file (Git data API
  tree + commit, or the contents API per file for small changes), with a
  generated message listing the entities changed.
- Optional "propose changes" mode opens a pull request instead.
- FDPlight checks the remote file SHA before writing so a concurrent edit is
  detected, never overwritten.

### 7.2 Ping workflow

FDPlight writes `.github/workflows/fdp-ping.yml` into the project. It pings
after every Pages deployment and on a schedule.

```yaml
name: Ping FDP Index
on:
  workflow_run:
    workflows: ["pages-build-deployment"]
    types: [completed]
  schedule:
    - cron: "17 3 */3 * *"     # every 3 days, the Index marks an FDP inactive after a week
  workflow_dispatch:
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Ping
        env:
          INDEX_URL: ${{ vars.FDP_INDEX_URL }}
          ROOT_URL: ${{ vars.FDP_ROOT_URL }}
        run: |
          curl --fail -sS -X POST "$INDEX_URL" \
            -H 'Content-Type: application/json' \
            -d "{\"clientUrl\": \"$ROOT_URL\"}"
```

- Index URL and root URL are repository variables, so the same workflow
  serves any Index. Indexes that need authorization (the ERDERA VP Index)
  get a secret and an extra header once the mechanism is known.
- The ping payload and the 204 response are verified against
  home.fairdatapoint.org (v1.22.1). The Index accepts only
  `application/json` (`IndexPingController`), not the form-encoded variant
  documented in the static-fdp README.
- The `workflow_run` trigger on the Pages workflow is to be verified in a
  pilot repository.

---

## 8. Open decisions

1. **Profile document.** What, if anything, is served at `profileIRI(T)`.
   Options are nothing (as WP13.3), the merged SHACL, or a PROF description
   like the RI.
2. **Container IRI form in file mode.** Hash (`E#dataset`, proposed) or RI
   style (`E/dataset/`).
3. **Default metrics.** Emit none (proposed) or mirror the RI defaults.
4. **ERDERA specifics.** `ejp:vpConnection ejp:VPDiscoverable` and
   `fdp:conformsToFdpSpec` appear in the WP13.3 files. Decide whether they are
   form fields (from the ERDERA shapes) or system triples of the ERDERA
   profile.
5. **Redirect mode** scope and timing.

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
  entries return 200. Cause unknown.
