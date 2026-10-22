// Regenerate the screenshots of the data-steward guide (docs/images/) from the
// built app, like Contour's scripts/shoot.mjs.
//
// Playwright is NOT a project dependency. One-time setup somewhere outside the
// repository, then point NODE_PATH at it:
//   npm i playwright && npx playwright install chromium
//   npm run build
//   NODE_PATH=<that folder>/node_modules GH_TOKEN=$(gh auth token) node scripts/shoot.cjs
//
// With GH_TOKEN, it also connects (read-only) to FAIRDataTeam/FDPlight to show
// loading, the review step and the Index status. It never clicks Publish.

const { chromium } = require('playwright');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/images');
const APP = 'file://' + path.join(ROOT, 'dist/index.html');

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'en-US', deviceScaleFactor: 1 });
  const shot = (name, target = page, opts = {}) => target.screenshot({ path: path.join(OUT, `${name}.png`), ...opts });
  const add = (label, n = 0) => page.getByRole('button', { name: label }).nth(n).click();
  const textInputs = () => page.locator('.form-preview input[type="text"], .form-preview textarea');
  const settle = () => page.waitForTimeout(700);

  // ---- a new project ----
  await page.goto(APP);
  await settle();
  await shot('start');

  const settings = page.locator('.top > .card').first();
  await page.getByLabel('Base URI').fill('https://my-org.github.io/my-fdp/');
  await page.getByLabel('Base URI').press('Enter');
  await page.getByText('Ping an FDP Index').click();
  await settle();
  await shot('settings', settings);

  // Root metadata, then a catalog with a dataset and a distribution.
  await textInputs().nth(0).fill('Rare disease registries');
  await add('+ Add catalog');
  await textInputs().nth(0).fill('Registries of the University Hospital');
  await add('+ Add dataset');
  await textInputs().nth(0).fill('Patient registry 2024');
  await add('+ Add distribution');
  await page.locator('.tree__node').nth(2).click();
  await settle();
  await shot('editor');
  await shot('tree', page.locator('nav.tree'));
  await shot('form', page.locator('section.card[aria-label="Metadata"]'), { clip: undefined });
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
  await page.getByLabel('Owner', { exact: true }).fill('FAIRDataTeam');
  await page.getByLabel('Repository', { exact: true }).fill('FDPlight');
  await page.getByLabel('Branch', { exact: true }).fill('main');
  await page.getByLabel('Token', { exact: true }).fill(process.env.GH_TOKEN);
  await page.getByRole('button', { name: 'Connect' }).click();
  await page.getByText('Loaded the project from the repository').waitFor({ timeout: 60000 });
  await page.getByText('What was read from each file').click();
  await settle();
  await shot('loaded', publish);

  // A small edit, then the review step (nothing is written).
  await page.locator('.tree__node').nth(2).click();
  await settle();
  const description = page.locator('.form-preview textarea').first();
  await description.fill((await description.inputValue()) + ' Example edit for the guide.');
  await settle();
  await page.getByRole('button', { name: 'Review changes' }).click();
  await page.getByText('will change in one commit').waitFor();
  await shot('review', publish);

  await page.getByRole('button', { name: 'Check the Index' }).click();
  await page.locator('.index__state').waitFor({ timeout: 60000 });
  await shot('index', settings);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
