import { flushPromises, mount } from '@vue/test-utils';
import App from './App.vue';

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
