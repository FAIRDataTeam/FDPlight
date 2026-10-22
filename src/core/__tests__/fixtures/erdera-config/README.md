`resource.ttl`, `patient-registry.ttl`: `shacl/resource.shacl` and
`shacl/patient-registry.shacl` of
[ERDERA/FDP-Reference-Implementation-Configuration](https://github.com/ERDERA/FDP-Reference-Implementation-Configuration)
(commit 4444c1a, CC0), fetched 2026-10-22. That repository configures the
FDP reference implementation for the ERDERA / EJP RD Virtual Platform: the
PatientRegistry metadata schema extends Resource, the resource definition
has URL prefix `patientregistry`, and a catalog holds registries through
`dct:hasPart` ("Patient Registries"). Used by `erdera.test.ts` (TASKS Phase
2: forms from real merged ERDERA shapes).
