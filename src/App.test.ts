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
    expect(w.find('.checks').text()).toBe('Structure OK');
  });

  it('shows settings errors for a bad base URI', async () => {
    const w = mount(App);
    const base = w.find('.settings__field input');
    await base.setValue('http://example.org/fdp');
    await base.trigger('change');
    expect(w.find('.settings__errors').text()).toContain('base URI must use https');
  });
});
