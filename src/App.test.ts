import { flushPromises, mount } from '@vue/test-utils';
import { RECORD_I18N } from '@fairdatateam/record-core/i18n';
import App from './App.vue';
import { setLocale, useI18n } from './composables/useI18n';
import { messages } from './i18n';
import { recordedFdpFetch } from './test/recordedFdp';

describe('App', () => {
  it('renders the product name', () => {
    expect(mount(App).text()).toContain('FDPlight');
  });

  it('builds a tree, fills a form and shows the Turtle it would publish', async () => {
    const w = mount(App);
    await w.findAll('button.tree__add').find((b) => b.text() === '+ Add catalog')!.trigger('click');
    await flushPromises();
    expect(w.find('.entity__file').text()).toMatch(/^catalog\/[a-z2-7]{8}\.ttl$/);

    const id = w.find('.entity__id input');
    await id.setValue('rare-diseases');
    await id.trigger('change');
    await flushPromises();
    expect(w.find('.entity__file').text()).toBe('catalog/rare-diseases.ttl');

    await w.find('.form-preview input[type="text"]').setValue('Rare diseases');
    await flushPromises();
    const ttl = w.find('pre.turtle').text();
    expect(ttl).toContain('dct:title "Rare diseases"');
    expect(ttl).toContain('dct:isPartOf <https://example.github.io/my-fdp/fdp.ttl>');
    expect(w.find('.tree__node.is-selected .tree__label').text()).toBe('Rare diseases');
    expect(w.find('.checks').text()).toContain('Structure OK');
  });

  it('moves a dataset to another catalog with the picker', async () => {
    const w = mount(App);
    const addCatalog = () => w.findAll('button.tree__add').find((b) => b.text() === '+ Add catalog')!.trigger('click');
    await addCatalog();
    await addCatalog();
    await flushPromises();
    const second = w.find('.entity__file').text();
    expect(w.find('.entity__move').exists()).toBe(false); // the root is the only place a catalog fits
    await w.findAll('.tree__node')[1].trigger('click');
    await w.findAll('button.tree__add').find((b) => b.text() === '+ Add dataset')!.trigger('click');
    await flushPromises();
    const select = w.find('.entity__move select');
    expect(select.findAll('option').map((o) => o.attributes('value'))).toEqual(['', second]);
    await select.setValue(second);
    await flushPromises();
    expect(w.find('pre.turtle').text()).toContain(`dct:isPartOf <https://example.github.io/my-fdp/${second}>`);
  });

  it('imports the profile of a running FDP from the settings', async () => {
    vi.stubGlobal('fetch', recordedFdpFetch());
    try {
      const w = mount(App);
      const select = w.find('.settings select');
      await select.setValue('__import');
      await w.find('.settings__import input').setValue('https://fdp.test');
      await w.find('.settings__import').trigger('submit');
      await flushPromises();
      expect(w.find('.settings__import').exists()).toBe(false);
      expect((select.element as HTMLSelectElement).value).toBe('imported');
      expect(select.text()).toContain('From https://fdp.test');

      await w.find('.settings select').setValue('__import');
      await w.find('.settings__import input').setValue('https://nowhere.test');
      await w.find('.settings__import').trigger('submit');
      await flushPromises();
      expect(w.find('.settings__error').text()).toBe(
        'Could not import the profile: GET https://nowhere.test/resource-definitions failed with HTTP 404',
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('moves through the tree with the arrow keys; only the selected node is a Tab stop', async () => {
    const w = mount(App, { attachTo: document.body });
    try {
      await w.findAll('button.tree__add').find((b) => b.text() === '+ Add catalog')!.trigger('click');
      await w.findAll('button.tree__add').find((b) => b.text() === '+ Add dataset')!.trigger('click');
      await flushPromises();
      const nodes = () => w.findAll('.tree__node');
      const dataset = w.find('.entity__file').text();
      expect(nodes().map((n) => n.attributes('tabindex'))).toEqual(['-1', '-1', '0']);
      await nodes()[2].trigger('keydown', { key: 'ArrowLeft' });
      await flushPromises();
      expect(w.find('.entity__file').text()).toMatch(/^catalog\//);
      expect(document.activeElement).toBe(nodes()[1].element);
      await nodes()[1].trigger('keydown', { key: 'Home' });
      await flushPromises();
      expect(w.find('.entity__file').text()).toBe('fdp.ttl');
      await nodes()[0].trigger('keydown', { key: 'End' });
      await flushPromises();
      expect(w.find('.entity__file').text()).toBe(dataset);
    } finally {
      w.unmount();
    }
  });

  it('switches the language of the app and of the form renderer', async () => {
    const w = mount(App, { global: { provide: { [RECORD_I18N as symbol]: { t: useI18n().t } } } });
    try {
      const nl = messages['nl-NL'] as { app: { tagline: string }; formPreview: { add: string } };
      await w.find('.lang select').setValue('nl-NL');
      await flushPromises();
      expect(w.find('.tagline').text()).toBe(nl.app.tagline);
      expect(document.documentElement.lang).toBe('nl-NL');
      expect(w.findAll('.form-preview button').some((b) => b.text() === nl.formPreview.add)).toBe(true);
      // SHACL findings under the fields too ("Required" → "Verplicht").
      await vi.waitFor(async () => {
        await flushPromises();
        expect(w.findAll('.form-preview .record-issue').map((m) => m.text())).toContain('Verplicht');
      }, { timeout: 5000 });
    } finally {
      setLocale('en');
    }
  });

  it('shows messages built by the core in the chosen language', async () => {
    const w = mount(App);
    try {
      await w.find('.lang select').setValue('pt-BR');
      const base = w.findAll('.settings__field input').find((i) => (i.element as HTMLInputElement).value.startsWith('https://example'))!;
      await base.setValue('http://example.org/fdp');
      await base.trigger('change');
      await flushPromises();
      expect(w.findAll('.settings__errors li').map((li) => li.text())).toEqual(['URI base: deve usar https', 'URI base: deve terminar com "/"']);
      await w.find('button.tree__add').trigger('click');
      await flushPromises();
      const id = w.find('.entity__id input');
      await id.setValue('Not Valid');
      await id.trigger('change');
      await flushPromises();
      expect(w.find('.entity .error').text()).toBe('"Not Valid" não é um id válido (letras minúsculas, dígitos e "-")');
    } finally {
      setLocale('en');
    }
  });

  it('offers an optional guided setup that fills in the settings on Finish', async () => {
    localStorage.removeItem('fdplight.setup.offered');
    const w = mount(App, { attachTo: document.body });
    try {
      expect(w.find('.offer').exists()).toBe(true);
      await w.find('.offer__start').trigger('click');
      expect(w.find('.offer').exists()).toBe(false);
      expect(localStorage.getItem('fdplight.setup.offered')).toBe('1');
      const dialog = () => w.find('[role="dialog"]');
      const inputs = () => dialog().findAll('input');
      await inputs()[0].setValue('erdera');
      await inputs()[1].setValue('my-fdp');
      await inputs()[3].setValue('metadata');
      expect(dialog().find('.wizard__base code').text()).toBe('https://erdera.github.io/my-fdp/metadata/');
      const next = () => dialog().findAll('button').find((b) => b.text() === 'Next')!.trigger('click');
      await next();
      await dialog().find('input[value="erdera"]').setValue(true);
      await next();
      await dialog().find('input[type="checkbox"]').setValue(true);
      await next();
      expect(dialog().text()).toContain('Repository erdera/my-fdp, branch main');
      await dialog().findAll('button').find((b) => b.text() === 'Finish')!.trigger('click');
      await flushPromises();
      expect(w.find('[role="dialog"]').exists()).toBe(false);
      expect(w.find('.settings select').element as HTMLSelectElement).toHaveProperty('value', 'erdera');
      const values = w.findAll('.settings__field input').map((i) => (i.element as HTMLInputElement).value);
      expect(values).toContain('https://erdera.github.io/my-fdp/metadata/');
      expect(values).toContain('metadata/');
      expect(values).toContain('https://home.fairdatapoint.org');
      expect(w.findAll('.publish input').map((i) => (i.element as HTMLInputElement).value).slice(0, 2)).toEqual(['erdera', 'my-fdp']);
    } finally {
      w.unmount();
      localStorage.setItem('fdplight.setup.offered', '1');
    }
  });

  it('can skip the guided setup and remembers it', async () => {
    localStorage.removeItem('fdplight.setup.offered');
    const w = mount(App);
    await w.find('.offer__dismiss').trigger('click');
    expect(w.find('.offer').exists()).toBe(false);
    expect(mount(App).find('.offer').exists()).toBe(false);
    await w.find('.setup-link').trigger('click');
    expect(w.find('[role="dialog"]').exists()).toBe(true);
    await w.findAll('[role="dialog"] button').find((b) => b.text() === 'Skip')!.trigger('click');
    expect(w.find('[role="dialog"]').exists()).toBe(false);
    expect(w.find('.settings__field input').exists()).toBe(true);
  });

  it('marks entities with missing required metadata', async () => {
    vi.useFakeTimers();
    const w = mount(App);
    await vi.runAllTimersAsync();
    vi.useRealTimers();
    await flushPromises();
    // Empty root: title, publisher and version are required by the FDP shapes.
    expect(w.find('.tree__errors').text()).toBe('3');
    expect(w.find('.checks').text()).toContain('3 problems to fix');
    expect(w.findAll('.form-preview .record-issue').map((p) => p.text())).toContain('Required');
  });

  it('shows settings errors for a bad base URI', async () => {
    const w = mount(App);
    const base = w.find('.settings__field input');
    await base.setValue('http://example.org/fdp');
    await base.trigger('change');
    expect(w.find('.settings__errors').text()).toContain('base URI must use https');
  });
});
