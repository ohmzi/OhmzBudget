import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  communitySidebar: [
    'intro',
    {
      type: 'link',
      label: 'Current Bug Reports',
      href: 'https://github.com/dtymoszenko/flybudget/issues?q=label%3Abug',
    },
    {
      type: 'link',
      label: 'New Feature Requests',
      href: 'https://github.com/dtymoszenko/flybudget/issues?q=label%3Aenhancement',
    },
  ],
};

export default sidebars;
