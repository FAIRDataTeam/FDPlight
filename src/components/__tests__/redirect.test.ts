// Redirect mode in the interface (SPEC §2.4, §2.5): the confirmation before
// re-basing a published FDP, the w3id panel and the w3id choice in the setup.
import { flushPromises, mount } from '@vue/test-utils';
import ProjectSettings from '../ProjectSettings.vue';
import SetupWizard from '../SetupWizard.vue';
import { useProject } from '../../composables/useProject';
import { usePublish } from '../../composables/usePublish';

const baseInput = (w: ReturnType<typeof mount>) => w.find<HTMLInputElement>('.settings input[type="url"]');

describe('redirect mode in the interface', () => {
  afterEach(() => vi.restoreAllMocks());

  it('re-bases an unpublished project silently and shows the w3id rules', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const state = useProject();
    const w = mount(ProjectSettings, { props: { state } });
    await baseInput(w).setValue('https://w3id.org/erdera/my-fdp/');
    await baseInput(w).trigger('change');
    expect(confirm).not.toHaveBeenCalled();
    expect(state.project.iriMode).toBe('redirect');
    expect(w.find('.w3id').text()).toContain('Enter the storage base');
    state.project.storageBase = 'https://erdera.github.io/my-fdp/';
    await flushPromises();
    expect(w.find('.w3id__rules').text()).toContain('RewriteRule ^$ https://erdera.github.io/my-fdp/fdp.ttl [R=302,L]');
    expect(w.text()).toContain('ids/erdera/my-fdp/.htaccess');
  });

  it('asks before re-basing a published project, and keeps the base when declined', async () => {
    const state = useProject();
    state.published.value = new Set(['fdp.ttl']);
    const w = mount(ProjectSettings, { props: { state } });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await baseInput(w).setValue('https://w3id.org/erdera/my-fdp/');
    await baseInput(w).trigger('change');
    expect(confirm).toHaveBeenCalledOnce();
    expect(state.project.base).toBe('https://example.github.io/my-fdp/');
    expect(baseInput(w).element.value).toBe('https://example.github.io/my-fdp/');
    confirm.mockReturnValue(true);
    await baseInput(w).setValue('https://w3id.org/erdera/my-fdp/');
    await baseInput(w).trigger('change');
    expect(state.project.base).toBe('https://w3id.org/erdera/my-fdp/');
  });

  it('sets up w3id IRIs with the files on Pages from the guided setup', async () => {
    const state = useProject();
    const pub = usePublish(state);
    const w = mount(SetupWizard, { props: { state, pub } });
    const inputs = () => w.findAll('input');
    await inputs()[0].setValue('erdera');
    await inputs()[1].setValue('my-fdp');
    await w.find('input[value="w3id"]').setValue(true);
    await w.find('input[placeholder="my-org/my-fdp"]').setValue('erdera/my-fdp');
    expect(w.find('.wizard__base code').text()).toBe('https://w3id.org/erdera/my-fdp/');
    for (let i = 0; i < 3; i++) await w.findAll('button').find((b) => b.text() === 'Next')!.trigger('click');
    await w.findAll('button').find((b) => b.text() === 'Finish')!.trigger('click');
    expect([state.project.base, state.project.iriMode, state.project.storageBase]).toEqual([
      'https://w3id.org/erdera/my-fdp/',
      'redirect',
      'https://erdera.github.io/my-fdp/',
    ]);
  });
});
