// The spreadsheet import in the interface (SPEC §4.4): the menu entry, the
// file picker, the report above the forms, and the red counts in the tree.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import App from '../../App.vue';
import { SHACL_DELAY_MS } from '../../composables/useProject';

const dir = join(dirname(fileURLToPath(import.meta.url)), '../../core/__tests__/fixtures/synthetic-registry/');
const fixture = (name: string, type = '') => new File([readFileSync(join(dir, name))], name, { type });

const profileSelect = (w: VueWrapper) => w.find<HTMLSelectElement>('.settings select');

async function choose(w: VueWrapper, value: string) {
  await profileSelect(w).setValue(value); // also fires change
}

async function pick(w: VueWrapper, files: File[]) {
  const input = w.find<HTMLInputElement>('.settings__import input[type="file"]');
  Object.defineProperty(input.element, 'files', { value: files, configurable: true });
  await input.trigger('change');
  await w.find('.settings__import').trigger('submit');
  // Reading the files, then the debounced SHACL check.
  for (let i = 0; i < 5; i++) await flushPromises();
  await new Promise((r) => setTimeout(r, SHACL_DELAY_MS + 50));
  for (let i = 0; i < 20; i++) await flushPromises();
}

const treeLabels = (w: VueWrapper) => w.findAll('.tree__node').map((n) => [n.find('.tree__label').text(), n.find('.tree__errors').exists() ? n.find('.tree__errors').text() : '']);

describe('spreadsheet import in the interface', () => {
  afterEach(() => vi.restoreAllMocks());

  it('explains that the import needs the ERDERA profile', async () => {
    const w = mount(App);
    await choose(w, '__sheet');
    expect(w.find('.settings__import').text()).toContain('Choose the ERDERA profile above first');
    expect(w.find('.settings__import input[type="file"]').exists()).toBe(false);
  });

  it('imports the workbook into an ERDERA project and shows the report above the forms', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = mount(App);
    await choose(w, 'erdera');
    await choose(w, '__sheet');
    expect(profileSelect(w).findAll('option').map((o) => o.text())).toEqual(
      expect.arrayContaining(['Import from a FAIR Data Point…', 'Open from files…', 'Import spreadsheet…']),
    );
    await pick(w, [fixture('synthetic-registry.xlsx')]);

    const report = w.find('.sheet-report');
    expect(report.exists()).toBe(true);
    // Shown before the forms.
    expect(report.element.compareDocumentPosition(w.find('.columns').element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(report.text()).toContain('2 records added.');
    expect(report.text()).toContain('PatientRegistry PersonalData: 1 value(s) not imported');
    expect(report.text()).toContain('PatientRegistry VPConnection: empty in 1 row(s), set to https://w3id.org/ejp-rd/vocabulary#VPDiscoverable');

    // The root keeps its (empty) metadata and its red counts; the imported records have none.
    const labels = treeLabels(w);
    expect(labels.slice(1)).toEqual([
      ['SYNTHETIC RKPA resources', ''],
      ['SYNTHETIC CAKUT Patient Registry', ''],
    ]);
    expect(labels[0][1]).not.toBe('');
    expect(w.find('.entity__file').text()).toBe('catalog/synthetic-rkpa-resources.ttl');

    await report.find('.sheet-report__close').trigger('click');
    expect(w.find('.sheet-report').exists()).toBe(false);
  });

  it('imports the TSV files the same way, and shows red counts where the sheet was incomplete', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = mount(App);
    await choose(w, 'erdera');
    await choose(w, '__sheet');
    const files = ['Organisation', 'ContactPoint', 'PatientRegistry', 'Catalog'].map((s) => fixture(`${s}.tsv`, 'text/tab-separated-values'));
    // The registry without its publisher's row: one red count, on the publisher.
    await pick(w, files.filter((f) => f.name !== 'Organisation.tsv'));
    expect(treeLabels(w).slice(1)).toEqual([
      ['SYNTHETIC RKPA resources', '1'],
      ['SYNTHETIC CAKUT Patient Registry', '1'],
    ]);
    expect(w.find('.sheet-report').text()).toContain('PatientRegistry row 2, Publisher: no Organisation titled “SYNTHETIC Rare Kidney Patient Alliance”');
  });

  it('reports files it cannot read', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = mount(App);
    await choose(w, 'erdera');
    await choose(w, '__sheet');
    await pick(w, [new File(['a,b'], 'notes.csv')]);
    expect(w.find('.settings__error').text()).toBe('Could not import the spreadsheet: Choose one .xlsx workbook, or one .tsv file per sheet');
    expect(w.find('.sheet-report').exists()).toBe(false);
  });
});
