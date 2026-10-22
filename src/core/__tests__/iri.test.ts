import {
  containerIri,
  detectIriMode,
  entityIri,
  filePath,
  htaccess,
  isValidId,
  mintId,
  pagesBase,
  profileIri,
  rebaser,
  storageUrl,
  validateBase,
  validateIriSettings,
} from '../iri';
import { FILE_MODE, REDIRECT_MODE } from './fixtures/defaultTree';

describe('validateBase (SPEC §2.1)', () => {
  it('accepts an https URI ending with a slash', () => {
    expect(validateBase('https://erdera.github.io/my-fdp/')).toEqual([]);
  });
  it.each([
    ['http://erdera.github.io/my-fdp/', 'must use https'],
    ['https://erdera.github.io/my-fdp', 'must end with "/"'],
    ['https://erdera.github.io/my-fdp/?x=1/', 'must not have a query'],
    ['https://erdera.github.io/my-fdp/#/', 'must not have a fragment'],
    ['https://u:p@erdera.github.io/', 'must not contain credentials'],
    ['my-fdp/', 'is not an absolute URI'],
  ])('rejects %s', (uri, problem) => {
    expect(validateBase(uri)).toContain(problem);
  });
  it('requires normal form so derived IRIs are stable', () => {
    expect(validateBase('https://Erdera.GitHub.io/my-fdp/')[0]).toMatch(/normal form/);
  });
});

describe('validateIriSettings (SPEC §2.2, §3.1)', () => {
  it('accepts both fixture settings', () => {
    expect(validateIriSettings(FILE_MODE)).toEqual([]);
    expect(validateIriSettings(REDIRECT_MODE)).toEqual([]);
  });
  it('needs a valid storage base in redirect mode only', () => {
    expect(validateIriSettings({ ...REDIRECT_MODE, storageBase: null })).toEqual(['redirect mode needs a storage base']);
    expect(validateIriSettings({ ...REDIRECT_MODE, storageBase: 'https://x.github.io/a' })).toEqual([
      'storage base must end with "/"',
    ]);
    expect(validateIriSettings({ ...FILE_MODE, storageBase: 'https://x.github.io/' })).toEqual([
      'file mode must not have a storage base',
    ]);
  });
});

describe('detectIriMode (SPEC §2.2)', () => {
  it('uses file mode on github.io', () => {
    expect(detectIriMode('https://erdera.github.io/my-fdp/')).toBe('file');
  });
  it("uses file mode on the repository's Pages custom domain", () => {
    expect(detectIriMode('https://fdp.example.org/', 'FDP.example.org')).toBe('file');
    expect(detectIriMode('https://fdp.example.org/', 'other.example.org')).toBe('ask');
  });
  it('uses redirect mode on known redirectors', () => {
    expect(detectIriMode('https://w3id.org/erdera/my-fdp/')).toBe('redirect');
    expect(detectIriMode('https://purl.org/erdera/')).toBe('redirect');
  });
  it('asks for anything else', () => {
    expect(detectIriMode('https://fdp.example.org/')).toBe('ask');
    expect(detectIriMode('https://notgithub.io/')).toBe('ask');
  });
});

describe('pagesBase (SPEC §2.1)', () => {
  it('proposes the Pages URL of a repository', () => {
    expect(pagesBase('ERDERA', 'my-fdp')).toBe('https://erdera.github.io/my-fdp/');
    expect(pagesBase('erdera', 'erdera.github.io')).toBe('https://erdera.github.io/');
  });
});

describe('ids (SPEC §2.3)', () => {
  it('mints 8 lowercase base32 characters', () => {
    const id = mintId();
    expect(id).toMatch(/^[a-z2-7]{8}$/);
    expect(isValidId(id)).toBe(true);
    expect(mintId((b) => b.fill(0))).toBe('aaaaaaaa');
    expect(mintId((b) => b.fill(31))).toBe('77777777');
  });
  it('accepts slugs and rejects anything that is not a path segment', () => {
    expect(isValidId('rare-diseases-2024')).toBe(true);
    for (const bad of ['', '-x', 'Rare', 'a/b', 'a.ttl', 'a b']) expect(isValidId(bad)).toBe(false);
  });
});

describe('entity IRIs and files (SPEC §2.3)', () => {
  it('file mode: IRIs are the file URLs', () => {
    expect(filePath('', 'ignored')).toBe('fdp.ttl');
    expect(filePath('catalog', 'abc')).toBe('catalog/abc.ttl');
    expect(entityIri(FILE_MODE, '', '')).toBe('https://example.github.io/my-fdp/fdp.ttl');
    expect(entityIri(FILE_MODE, 'catalog', 'abc')).toBe('https://example.github.io/my-fdp/catalog/abc.ttl');
    expect(storageUrl(FILE_MODE, 'catalog', 'abc')).toBe('https://example.github.io/my-fdp/catalog/abc.ttl');
  });
  it('redirect mode: extensionless IRIs, files under the storage base', () => {
    expect(entityIri(REDIRECT_MODE, '', '')).toBe('https://w3id.org/example/my-fdp/');
    expect(entityIri(REDIRECT_MODE, 'catalog', 'abc')).toBe('https://w3id.org/example/my-fdp/catalog/abc');
    expect(storageUrl(REDIRECT_MODE, '', '')).toBe('https://example.github.io/my-fdp/fdp.ttl');
    expect(storageUrl(REDIRECT_MODE, 'catalog', 'abc')).toBe('https://example.github.io/my-fdp/catalog/abc.ttl');
  });
});

describe('derived IRIs (SPEC §2.6, §5.2)', () => {
  it('containers: hash in file mode, RI form in redirect mode', () => {
    expect(containerIri(FILE_MODE, 'https://example.github.io/my-fdp/catalog/abc.ttl', 'dataset')).toBe(
      'https://example.github.io/my-fdp/catalog/abc.ttl#dataset',
    );
    expect(containerIri(REDIRECT_MODE, 'https://w3id.org/example/my-fdp/catalog/abc', 'dataset')).toBe(
      'https://w3id.org/example/my-fdp/catalog/abc/dataset/',
    );
    expect(containerIri(REDIRECT_MODE, 'https://w3id.org/example/my-fdp/', 'catalog')).toBe(
      'https://w3id.org/example/my-fdp/catalog/',
    );
  });
  it('profile IRIs follow the mode', () => {
    expect(profileIri(FILE_MODE, 'catalog')).toBe('https://example.github.io/my-fdp/profile/catalog.ttl');
    expect(profileIri(REDIRECT_MODE, 'catalog')).toBe('https://w3id.org/example/my-fdp/profile/catalog');
  });
});

describe('htaccess (SPEC §2.4)', () => {
  it('redirects the base to the root file and every path to its .ttl', () => {
    const rules = htaccess(REDIRECT_MODE);
    expect(rules).toContain('RewriteRule ^$ https://example.github.io/my-fdp/fdp.ttl [R=302,L]');
    expect(rules).toContain('RewriteRule ^(.+)$ https://example.github.io/my-fdp/$1.ttl [R=302,L]');
  });
  it('is refused in file mode', () => {
    expect(() => htaccess(FILE_MODE)).toThrow();
  });
});

describe('rebaser (SPEC §2.5)', () => {
  const entities = [
    { urlPrefix: '', id: '' },
    { urlPrefix: 'catalog', id: 'abc' },
  ];
  it('maps entity IRIs and their hash IRIs across a mode switch', () => {
    const r = rebaser(entities, FILE_MODE, REDIRECT_MODE);
    expect(r('https://example.github.io/my-fdp/fdp.ttl')).toBe('https://w3id.org/example/my-fdp/');
    expect(r('https://example.github.io/my-fdp/fdp.ttl#publisher')).toBe('https://w3id.org/example/my-fdp/#publisher');
    expect(r('https://example.github.io/my-fdp/catalog/abc.ttl#publisher-2')).toBe(
      'https://w3id.org/example/my-fdp/catalog/abc#publisher-2',
    );
  });
  it('swaps the base for other IRIs under it and leaves foreign IRIs alone', () => {
    const r = rebaser(entities, FILE_MODE, { ...FILE_MODE, base: 'https://fdp.example.org/' });
    expect(r('https://example.github.io/my-fdp/docs/readme.html')).toBe('https://fdp.example.org/docs/readme.html');
    expect(r('https://orcid.org/0000-0001')).toBe('https://orcid.org/0000-0001');
  });
});
