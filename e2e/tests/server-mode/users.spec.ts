import { test, expect, type Page } from '@playwright/test';

// Server mode's identities: the accounts an admin manages (Settings → Server → Users) and
// the bearer tokens for machine callers (Settings → Server → API tokens). These run after
// auth.spec, against the same server: auth.spec sets it up and changes the owner's password,
// which is what OWNER_PASSWORD below holds. Serial, like a real server being administered.

test.describe.configure({ mode: 'serial' });

const OWNER = 'owner';
/** The password auth.spec's change-password test leaves the owner with */
const OWNER_PASSWORD = 'even better passphrase';
const MEMBER = 'household';
const MEMBER_PASSWORD = 'household passphrase';

/** The admin's browser; it stays signed in across these tests */
let owner: Page;
/** A second browser, for the member's own sign-in */
let member: Page;
/** The plaintext of the token one test mints and the next revokes */
let token = '';

test.beforeAll(async ({ browser }) => {
  // Two separate browsers, like two people: separate cookie jars, separate sessions
  owner = await (await browser.newContext()).newPage();
  member = await (await browser.newContext()).newPage();
});
test.afterAll(async () => {
  await owner.context().close();
  await member.context().close();
});

async function signIn(page: Page, username: string, password: string) {
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('the admin creates a member account', async ({ baseURL }) => {
  await owner.goto(`${baseURL}/`);
  await signIn(owner, OWNER, OWNER_PASSWORD);
  await expect(owner.getByRole('complementary')).toBeVisible();

  await owner.goto(`${baseURL}/settings?tab=server`);
  await expect(owner.getByRole('heading', { name: 'Users' })).toBeVisible();

  // "Add user" names the section button and, once it opens, the dialog's submit
  await owner.getByRole('button', { name: 'Add user' }).click();
  const dialog = owner.getByRole('dialog', { name: 'Add user' });
  await dialog.getByLabel('Username').fill(MEMBER);
  await dialog.getByLabel('Password').fill(MEMBER_PASSWORD);
  // New accounts are members unless the admin says otherwise
  await expect(dialog.getByLabel('Role')).toHaveValue('member');
  await dialog.getByRole('button', { name: 'Add user' }).click();
  await expect(dialog).toBeHidden();

  await expect(owner.getByRole('cell', { name: MEMBER, exact: true })).toBeVisible();
});

test('the member signs in with less on screen, and the API refuses admin calls', async ({
  baseURL,
}) => {
  await member.goto(`${baseURL}/settings?tab=server`);
  await expect(member.getByText('Sign in to OhmzBudget')).toBeVisible();
  await signIn(member, MEMBER, MEMBER_PASSWORD);
  await expect(member.getByRole('complementary')).toBeVisible();

  // Users and API tokens are for admins: a member gets no such section (and no Add user)
  await expect(member.getByRole('heading', { name: 'Users' })).toHaveCount(0);
  await expect(member.getByRole('button', { name: 'Add user' })).toHaveCount(0);
  await expect(member.getByRole('button', { name: 'Create token' })).toHaveCount(0);

  // The API is the real boundary: a member's session cookie is refused, not just hidden in the UI
  const refused = await member.request.get('/api/users');
  expect(refused.status()).toBe(403);
});

test('the admin mints a service token that authenticates a machine caller', async ({
  baseURL,
  playwright,
}) => {
  // The admin is still on Settings → Server from the first test
  await expect(owner.getByRole('heading', { name: 'API tokens' })).toBeVisible();
  await owner.getByRole('button', { name: 'Create token' }).click();
  const dialog = owner.getByRole('dialog', { name: 'Create token' });
  await dialog.getByLabel('Name').fill('test-sidecar');
  // `service` is ticked by default (the sidecar's scope); `ingest` is not
  await expect(dialog.getByRole('checkbox', { name: 'service' })).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: 'ingest' })).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Create token' }).click();
  await expect(dialog).toBeHidden();

  // The plaintext is shown once, in the one-time block; it is never listed again
  const block = owner.getByRole('status');
  await expect(block).toContainText('Copy this token now — it will not be shown again.');
  token = (await block.innerText()).match(/ozb_[A-Za-z0-9_-]+/)?.[0] ?? '';
  expect(token).toMatch(/^ozb_/);

  // A machine caller: the raw token as a bearer header, no cookies at all
  const sidecar = await playwright.request.newContext({ baseURL });
  try {
    const me = await sidecar.get('/api/service/whoami', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(me.status()).toBe(200);
    expect(await me.json()).toEqual({ name: 'test-sidecar', scopes: ['service'] });

    // Without the header there is no identity at all
    expect((await sidecar.get('/api/service/whoami')).status()).toBe(401);
  } finally {
    await sidecar.dispose();
  }
});

test('revoking a token stops it working', async ({ baseURL, playwright }) => {
  // The tokens table sits low on the page and the row menu closes on any scroll:
  // center the row first, so opening the menu can't scroll it away
  const row = owner.getByRole('row', { name: /test-sidecar/ });
  await row.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await owner.getByRole('button', { name: 'Actions for test-sidecar' }).click();
  await owner.getByRole('menuitem', { name: 'Revoke' }).click();

  const confirm = owner.getByRole('dialog', { name: 'Revoke token?' });
  await confirm.getByRole('button', { name: 'Revoke' }).click();
  await expect(confirm).toBeHidden();
  await expect(row).toContainText('Revoked');

  const sidecar = await playwright.request.newContext({ baseURL });
  try {
    await expect
      .poll(async () =>
        (
          await sidecar.get('/api/service/whoami', {
            headers: { authorization: `Bearer ${token}` },
          })
        ).status(),
      )
      .toBe(401);
  } finally {
    await sidecar.dispose();
  }
});

// The last sign-in of the server-mode project, and it has to stay last: it burns the
// per-IP failed-login limit (10 failures, 15 minutes), which refuses every fresh sign-in
// until it expires. Every other spec's logins run before it; auth.spec's own tests would
// break if this lived there (it comes before this file).
test("someone guessing passwords can't lock the owner out", async ({ playwright, baseURL }) => {
  // An attacker from the same address (e.g. behind the same reverse proxy) burns
  // through the failed-login limit…
  const attacker = await playwright.request.newContext({ baseURL });
  let status = 0;
  for (let i = 0; i < 12 && status !== 429; i++) {
    status = (
      await attacker.post('/api/auth/login', { data: { password: `guess ${i}` } })
    ).status();
  }
  expect(status).toBe(429);
  await attacker.dispose();

  // …but a browser that signed in before has its own limit and still gets in
  await owner.goto(`${baseURL}/settings?tab=server`);
  await owner.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(owner.getByText('Sign in to OhmzBudget')).toBeVisible();
  await signIn(owner, OWNER, OWNER_PASSWORD);
  await expect(owner.getByRole('complementary')).toBeVisible();
});
