// Messages the core builds for people: structural checks, tree and settings
// errors, import and copy reports (TASKS Phase 8). The core stays English and
// free of the interface's i18n. Each message is built from one template
// below, and the built string remembers its key and parameters, so the
// interface can show it in the user's language (`coreMessageOf`). The
// interface catalogs translate these keys under `core.`.
//
// JSON-format errors of `fdplight.json` and profiles (validateTypes,
// parseProjectFile) are for profile authors and stay English.

export const CORE_MESSAGES = {
  // SPEC §6, structural checks
  sharedIri: '{n} entities share the IRI {iri}',
  rootCount: 'the project must have exactly one root entity (found {n})',
  rootParent: 'the root entity cannot have a parent',
  noParent: 'has no parent',
  parentMissing: 'its parent {parent} is not in the project',
  cannotContain: 'a {parent} cannot contain a {child}',
  danglingLink: 'links to {iri}, which has no file in the project',
  outsideBase: 'describes {iri}, which is not under the base URI',
  malformedIri: 'malformed IRI {iri}: {problem}',
  iriChars: 'contains characters not allowed in IRIs',
  iriHashes: 'has more than one "#"',
  iriEmptyFragment: 'has an empty fragment',
  iriNotAbsolute: 'is not an absolute IRI',
  sharedContainer: 'the container {iri} is declared in {paths}',
  rootUntyped: 'the root must have rdf:type fdp:MetadataService or r3d:Repository',
  // the entity tree
  noEntity: 'no entity at {path}',
  typeNotInUse: '{type} is not in use in this project',
  invalidId: '"{id}" is not a valid id (lowercase letters, digits and "-")',
  exists: '{path} already exists',
  rootNotRemovable: 'the root cannot be removed',
  rootFileFixed: 'the root file is always fdp.ttl',
  importedKeepsName: 'an imported entity keeps its file name and IRI',
  rootNotMovable: 'the root cannot be moved',
  moveBelowItself: 'an entity cannot be moved below itself',
  idLocked: 'This entity is published: its id is part of its IRI and can no longer change.',
  typeHasRecords: 'There are {type} records in this project; delete them first.',
  // settings (SPEC §2, §4, §7.2)
  baseUri: 'base URI {problem}',
  storageBase: 'storage base {problem}',
  notAbsoluteUri: 'is not an absolute URI',
  mustHttps: 'must use https',
  mustSlash: 'must end with "/"',
  noQuery: 'must not have a query',
  noFragment: 'must not have a fragment',
  noCredentials: 'must not contain credentials',
  notNormal: 'is not in normal form (expected {expected})',
  storageBaseNeeded: 'redirect mode needs a storage base',
  storageBaseInFileMode: 'file mode must not have a storage base',
  unknownMode: 'unknown IRI mode "{mode}"',
  folderForm: 'folder must be empty or like "metadata/" (path segments ending with "/")',
  folderDots: 'folder must not contain "." or ".." segments',
  folderGithub: 'folder must not be inside .github/',
  indexUrl: 'Index URL must be an https URL',
  pagesWorkflow: 'Pages workflow name is required',
  // loading a project (SPEC §4.1, §5.7)
  notInRepository: '{path}: linked from {from} but not in the repository',
  notInRepositoryRoot: '{path}: linked from the settings but not in the repository',
  notTurtleSkipped: '{path}: not valid Turtle ({error}); skipped',
  describesNothing: '{path}: describes nothing about {iri}',
  missingClasses: '{path}: not typed as every class of {type} (adding {classes} on save)',
  isPartOfMismatch: '{path}: dct:isPartOf points to {up} but {parent} lists it; using {parent}',
  linkOutside: '{path}: links to {target}, which is not a file under the base URI; left out',
  listedTwice: '{path}: listed by {first} and {second}; kept under {first}',
  notLinked: '{path}: not linked from the tree; left out',
  rootUnreadable: '{path}: the root could not be read',
  typeBackInUse: '{type}: the repository has records of this type, so it is now in use',
  noMetadata: '{path}: no metadata for {iri} could be read',
  othersKept: '{path}: {n} other record(s) in the file are kept as they are',
  identifierReplaced:
    '{path}: identifier node {nodes} is not the one fdp:metadataIdentifier points to ({declared}); replaced by {fresh}',
  identifierReplacedNone: '{path}: identifier node {nodes} is not the one fdp:metadataIdentifier points to (none); replaced by {fresh}',
  identifierMissing: '{path}: fdp:metadataIdentifier points to {declared}, which the file does not describe; replaced by {fresh}',
  containerShared: 'container {iri} is declared in {paths} for different parents; each file gets its own container on save',
  shapesMissing: '{path} is missing from the repository',
  // opening an FDP FDPlight did not make (SPEC §4.2)
  rootNotInRepository: '{path} is not in the repository',
  rootNotTurtle: '{path} is not valid Turtle: {error}',
  noFdpRoot: '{path} has no FAIR Data Point whose IRI ends with /{file}',
  migrated: 'Migrated to new IRIs. The old files stay in the repository until you delete them: {paths}',
  // copying an FDP by its URL (SPEC §4.3)
  copyStopped: 'Stopped after {max} records; {n} more were not copied',
  copyRootUnreadable: '{iri} could not be read ({error}); the server may not allow browser access (CORS)',
  copyUnreadable: '{iri}: could not be read ({error}); left out',
  copyRootHttp: '{iri} answered HTTP {status}',
  copyHttp: '{iri}: HTTP {status}; left out',
  copyRootNotTurtle: '{iri} is not Turtle ({error})',
  copyNotTurtle: '{iri}: not Turtle ({error}); left out',
  copyRootNoSelf: '{iri} does not describe itself; is it the root of a FAIR Data Point?',
  copyNoSelf: '{iri}: does not describe itself; left out',
  copyOtherTypes: '{iri}: {n} record(s) linked by {relation} are not in this profile; left out',
  copyNoMetadata: '{iri}: no metadata could be read into the form',
  copyOthersKept: '{iri}: {n} other record(s) in the response are kept as they are',
  copyServerTriples:
    '{n} triple(s) the source server generated about itself (metrics, profiles, API description) were left out; FDPlight writes its own',
  copied: 'Copied {n} record(s) from {iri}. They get new IRIs under {base}; each links to its old IRI with prov:wasDerivedFrom.',
  // profiles (SPEC §3)
  profileHttp: 'GET {url} failed with HTTP {status}',
  profileUnusable: "the FDP's resource definitions are not usable: {errors}",
  filesOneJson: 'choose exactly one .json file with the types (found {n})',
  filesBadJson: '{file} is not valid JSON: {error}',
  filesNotObject: '{file} must be a JSON object',
  filesProblem: '{file}: {error}',
  filesUse: '{file}: use must be a list of type keys',
  filesHttp: '{type}: {url} answered HTTP {status}',
  filesUnreadable: '{type}: {url} could not be read ({error})',
  filesMissing: '{type}: choose its shapes file {file} too',
  filesBadTurtle: '{file} is not valid Turtle: {error}',
} as const;

export type CoreKey = keyof typeof CORE_MESSAGES;
export type Params = Record<string, string | number>;

export interface CoreMessage {
  key: CoreKey;
  params: Params;
}

/** Built strings and how they were built; the oldest are forgotten first. */
const built = new Map<string, CoreMessage>();
const KEEP = 5000;

/** `{name}` placeholders filled from `params`. */
export function interpolate(template: string, params: Params = {}): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

/** The English message `key` with `params`, remembered for translation. */
export function say(key: CoreKey, params: Params = {}): string {
  const text = interpolate(CORE_MESSAGES[key], params);
  built.delete(text);
  built.set(text, { key, params });
  if (built.size > KEEP) built.delete(built.keys().next().value!);
  return text;
}

/** How a core message was built, or undefined for any other string. */
export function coreMessageOf(text: string): CoreMessage | undefined {
  return built.get(text);
}

/**
 * A core message in another language: `translate(key, params)` gets the
 * `core.` key, with parameters that are core messages themselves (e.g. the
 * problem in "base URI {problem}") translated first. Other strings stay.
 */
export function translateCore(text: string, translate: (key: string, params: Params) => string): string {
  const m = coreMessageOf(text);
  if (!m) return text;
  const params: Params = {};
  for (const [k, v] of Object.entries(m.params)) params[k] = typeof v === 'string' ? translateCore(v, translate) : v;
  return translate(`core.${m.key}`, params);
}
