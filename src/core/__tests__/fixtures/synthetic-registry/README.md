`synthetic-registry.xlsx` and `{Organisation,ContactPoint,PatientRegistry,Catalog}.tsv`:
fixture 1 of the ERDERA D11 demonstrator (luizbonino/erdera-demonstrators,
`demonstrators/D11-spreadsheet-to-portal/fixtures/synthetic-registry/`, commit
29ec1d6), copied 2026-11-06. SYNTHETIC data: the official ERDERA resource
metadata template (ejp-rd-vp/resource-metadata-schema commit 74df189, CC0)
filled for a fictional patient organisation, once as the workbook and once as
one TSV per sheet with the same values. One organisation, one contact point,
one patient registry and one catalog that lists it; the other resource sheets
are empty. Used by `spreadsheet*.test.ts` (SPEC §4.4).
