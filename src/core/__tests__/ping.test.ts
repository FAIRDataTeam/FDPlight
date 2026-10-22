import { pingWorkflow, validateIndex } from '../ping';
import { validateFolder } from '../profile';

const INDEX = { url: 'https://home.fairdatapoint.org/', pagesWorkflow: 'Deploy to GitHub Pages' };

describe('ping workflow (SPEC §7.2)', () => {
  it('pings after the Pages workflow, on a schedule and on demand, with the URLs inline', () => {
    const y = pingWorkflow('https://fdplight.fairdatapoint.org/metadata/fdp.ttl', INDEX);
    expect(y).toContain('workflows: ["Deploy to GitHub Pages"]');
    expect(y).toContain('cron: "17 3 */3 * *"');
    expect(y).toContain('workflow_dispatch:');
    expect(y).toContain("if: github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success'");
    expect(y).toContain('INDEX_URL: "https://home.fairdatapoint.org"');
    expect(y).toContain('ROOT_URL: "https://fdplight.fairdatapoint.org/metadata/fdp.ttl"');
    expect(y).toContain(`-d "{\\"clientUrl\\": \\"$ROOT_URL\\"}"`);
    expect(y).toContain('permissions: {}');
  });

  it('refuses values that could break out of the YAML or the shell', () => {
    expect(validateIndex({ url: 'http://x', pagesWorkflow: 'a' })).toEqual(['Index URL must be an https URL']);
    expect(validateIndex({ url: 'https://x/"; rm', pagesWorkflow: 'a' })).toHaveLength(1);
    expect(validateIndex({ url: 'https://x', pagesWorkflow: '$(evil)' })).toHaveLength(1);
    expect(() => pingWorkflow('https://x/$(evil)', INDEX)).toThrow(/root IRI/);
  });
});

describe('validateFolder (SPEC §4)', () => {
  it('accepts the root and folder paths ending with a slash', () => {
    for (const ok of ['', 'metadata/', 'docs/fdp/']) expect(validateFolder(ok)).toEqual([]);
  });
  it('rejects anything else', () => {
    for (const bad of ['metadata', '/metadata/', '../x/', '.github/x/', 'a b/']) expect(validateFolder(bad)).toHaveLength(1);
  });
});
