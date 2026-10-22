// Namespaces and terms used by the wiring (SPEC §5) and the Turtle writer.

export const NS = {
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  dct: 'http://purl.org/dc/terms/',
  dcat: 'http://www.w3.org/ns/dcat#',
  fdp: 'https://w3id.org/fdp/fdp-o#',
  ldp: 'http://www.w3.org/ns/ldp#',
  foaf: 'http://xmlns.com/foaf/0.1/',
  datacite: 'http://purl.org/spar/datacite/',
  sio: 'http://semanticscience.org/resource/',
  r3d: 'http://www.re3data.org/schema/3-0#',
  vcard: 'http://www.w3.org/2006/vcard/ns#',
  schema: 'https://schema.org/',
  ejp: 'https://w3id.org/ejp-rd/vocabulary#',
} as const;

export const RDF_TYPE = `${NS.rdf}type`;
export const RDFS_LABEL = `${NS.rdfs}label`;
export const XSD_DATETIME = `${NS.xsd}dateTime`;

export const DCT = {
  title: `${NS.dct}title`,
  description: `${NS.dct}description`,
  identifier: `${NS.dct}identifier`,
  language: `${NS.dct}language`,
  license: `${NS.dct}license`,
  accessRights: `${NS.dct}accessRights`,
  RightsStatement: `${NS.dct}RightsStatement`,
  issued: `${NS.dct}issued`,
  modified: `${NS.dct}modified`,
  isPartOf: `${NS.dct}isPartOf`,
  conformsTo: `${NS.dct}conformsTo`,
};

export const FDP = {
  MetadataService: `${NS.fdp}MetadataService`,
  metadataIdentifier: `${NS.fdp}metadataIdentifier`,
  metadataIssued: `${NS.fdp}metadataIssued`,
  metadataModified: `${NS.fdp}metadataModified`,
  fdpSoftwareVersion: `${NS.fdp}fdpSoftwareVersion`,
};

export const DCAT = {
  endpointURL: `${NS.dcat}endpointURL`,
};

export const LDP = {
  DirectContainer: `${NS.ldp}DirectContainer`,
  membershipResource: `${NS.ldp}membershipResource`,
  hasMemberRelation: `${NS.ldp}hasMemberRelation`,
  contains: `${NS.ldp}contains`,
};

export const DATACITE_IDENTIFIER = `${NS.datacite}Identifier`;
export const R3D_REPOSITORY = `${NS.r3d}Repository`;

export const SIO = {
  refersTo: `${NS.sio}SIO_000628`,
  isAbout: `${NS.sio}SIO_000332`,
};
