/**
 * Where OhmzBudget's source code lives, linked from Settings. OhmzBudget is AGPL-3.0:
 * if you run a modified version for other people over a network, point this at your
 * own source code so your users can get it (AGPL-3.0, section 13).
 */
export const SOURCE_CODE_URL = 'https://github.com/ohmzi/OhmzBudget';
export const LICENSE_URL = 'https://www.gnu.org/licenses/agpl-3.0.html';

/**
 * OhmzBudget's website and user guide. The rebranded site isn't live yet, so these
 * point at the repository for now.
 */
export const WEBSITE_URL = 'https://github.com/ohmzi/OhmzBudget';
export const DOCS_URL = 'https://github.com/ohmzi/OhmzBudget';

/** Where people report bugs and ask for features */
export const ISSUES_URL = 'https://github.com/ohmzi/OhmzBudget/issues';

/** How to run OhmzBudget on your own server (linked from Settings → Server) */
export const SELF_HOSTING_URL = 'https://github.com/ohmzi/OhmzBudget';

/** A page of the user guide, e.g. `docsUrl('budgeting')` */
export type DocsPage =
  | 'getting-started'
  | 'accounts'
  | 'transactions'
  | 'bank-sync'
  | 'budgeting'
  | 'recurring'
  | 'reports'
  | 'rules'
  | 'goals'
  | 'backups';

export const docsUrl = (page: DocsPage) => `${WEBSITE_URL}/docs/${page}`;
