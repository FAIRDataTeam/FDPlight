import { flushPromises, mount } from '@vue/test-utils';
import App from './App.vue';

describe('App', () => {
  it('renders the product name', () => {
    expect(mount(App).text()).toContain('FDPlight');
  });

  it('renders the dataset form and the Turtle it would publish', async () => {
    const w = mount(App);
    await w.findAll('button.tab').find((b) => b.text() === 'Dataset')!.trigger('click');
    await flushPromises();
    expect(w.find('.form-preview__group-title').exists()).toBe(true);
    expect(w.text()).toContain('https://example.github.io/my-fdp/dataset/example.ttl');
    const input = w.find('.form-preview input[type="text"]');
    await input.setValue('Registry 2024');
    await flushPromises();
    const ttl = w.find('pre.turtle').text();
    expect(ttl).toContain('dct:title "Registry 2024"');
    expect(ttl).toContain('dct:isPartOf <https://example.github.io/my-fdp/catalog/example.ttl>');
    expect(ttl).toContain('fdp:metadataIssued');
  });
});
