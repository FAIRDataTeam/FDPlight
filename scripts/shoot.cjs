// Regenerate the screenshots of the data-steward guide (docs/images/) from the
// built app, like Contour's scripts/shoot.mjs.
//
// Playwright is NOT a project dependency. One-time setup somewhere outside the
// repository, then point NODE_PATH at it:
//   npm i playwright && npx playwright install chromium
//   npm run build
//   NODE_PATH=<that folder>/node_modules GH_TOKEN=$(gh auth token) node scripts/shoot.cjs
//   LOCALE=pt-BR NODE_PATH=… node scripts/shoot.cjs   # docs/images-pt/, interface in Portuguese
//
// Selectors are CSS classes, not visible text, so every locale works the same.
// With GH_TOKEN, it also connects (read-only) to FAIRDataTeam/FDPlight to show
// loading, the review step and the Index status. It never clicks Publish.

const { chromium } = require('playwright');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const LOCALE = process.env.LOCALE || 'en';
const DIRS = { en: 'images', 'pt-BR': 'images-pt', 'nl-NL': 'images-nl', 'de-DE': 'images-de', 'es-ES': 'images-es', 'fr-FR': 'images-fr' };
if (!DIRS[LOCALE]) throw new Error(`unknown LOCALE ${LOCALE}`);
const OUT = path.join(ROOT, 'docs', DIRS[LOCALE]);
const APP = 'file://' + path.join(ROOT, 'dist/index.html');

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: LOCALE === 'en' ? 'en-US' : LOCALE, deviceScaleFactor: 1 });
  const shot = (name, target = page, opts = {}) => target.screenshot({ path: path.join(OUT, `${name}.png`), ...opts });
  // "+ Add …" under the selected entity (its first child group).
  const addChild = async () => {
    const at = await page.locator('.tree__node.is-selected').getAttribute('data-path');
    await page.locator(`li.tree__item:has(> .tree__node[data-path="${at}"]) > .tree__group > button.tree__add`).first().click();
  };
  const textInputs = () => page.locator('.form-preview input[type="text"], .form-preview textarea');
  const settle = () => page.waitForTimeout(700);

  // ---- a new project ----
  // The guided-setup offer is shown on a first visit only; the guide shows the editor.
  await page.addInitScript((locale) => {
    localStorage.setItem('fdplight.setup.offered', '1');
    localStorage.setItem('fdplight.locale', locale);
  }, LOCALE);
  await page.goto(APP);
  await settle();
  await shot('start');

  const settings = page.locator('.top > .card').first();
  const base = settings.locator('.settings input[type="url"]').first();
  await base.fill('https://my-org.github.io/my-fdp/');
  await base.press('Enter');
  await settings.locator('.settings > label.settings__check input').click();
  await settle();
  await shot('settings', settings);

  // Root metadata, then a catalog with a dataset and a distribution.
  await textInputs().nth(0).fill('Rare disease registries');
  await addChild();
  await textInputs().nth(0).fill('Registries of the University Hospital');
  await addChild();
  await textInputs().nth(0).fill('Patient registry 2024');
  await addChild();
  await page.locator('.tree__node').nth(2).click();
  await settle();
  await shot('editor');
  await shot('tree', page.locator('nav.tree'));
  await shot('form', page.locator('.columns > section.card').first(), { clip: undefined });
  await shot('checks', page.locator('.checks'));

  const move = page.locator('.entity__actions');
  await shot('entity-actions', move);

  // ---- connected to this repository (read-only) ----
  const publish = page.locator('.top > .card').nth(1);
  await shot('connect', publish);
  if (!process.env.GH_TOKEN) {
    console.log('GH_TOKEN not set: skipped the connected screenshots');
    await browser.close();
    return;
  }
  page.on('dialog', (d) => d.accept()); // "replace what you entered here?"
  const connect = page.locator('.publish__connect');
  const fields = connect.locator('input');
  await fields.nth(0).fill('FAIRDataTeam');
  await fields.nth(1).fill('FDPlight');
  await fields.nth(2).fill('main');
  await fields.nth(3).fill(process.env.GH_TOKEN);
  await connect.locator('button[type="submit"]').click();
  await page.locator('.publish__loaded').waitFor({ timeout: 60000 });
  await page.locator('.publish__counts summary').click();
  await settle();
  await shot('loaded', publish);

  // A small edit, then the review step (nothing is written).
  await page.locator('.tree__node').nth(2).click();
  await settle();
  const description = page.locator('.form-preview textarea').first();
  await description.fill((await description.inputValue()) + ' Example edit for the guide.');
  await settle();
  await page.locator('.publish__connected > button.primary').click();
  await page.locator('.publish__plan ul').waitFor();
  await shot('review', publish);

  await page.locator('button.index__check').click();
  await page.locator('.index__state').waitFor({ timeout: 60000 });
  await shot('index', settings);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
