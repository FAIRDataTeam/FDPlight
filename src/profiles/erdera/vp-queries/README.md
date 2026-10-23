# VP Level 1 and Level 2 queries

`vp_level1_query.sparql` and `vp_level2_query.sparql` are copied unchanged
from [ERDERA/WP13.3_document_based_fdp](https://github.com/ERDERA/WP13.3_document_based_fdp/tree/05f25cea57036839342c5ad79e5d03a2a9d60ee1/queries)
(commit 05f25ce, MIT, see [LICENSE](LICENSE)). The Virtual Platform uses them to
list the resources of the FDPs in its Index. Level 1 lists FDPs and typed
`dcat:Resource` records; Level 2 lists data services.

`src/profiles/__tests__/vpQueries.test.ts` runs them against what FDPlight
writes for an ERDERA project (SPEC §9.6).
