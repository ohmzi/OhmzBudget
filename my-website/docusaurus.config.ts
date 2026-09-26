import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'FlyBudget',
  tagline: 'A fast, open-source budgeting app that gives you complete control over your financial data.',
  favicon: 'img/logo.png',

  future: {
    v4: true,
  },

  url: 'https://your-docusaurus-site.example.com',
  baseUrl: '/',

  organizationName: 'dtymoszenko',
  projectName: 'budgeting-project',

  stylesheets: [
    {
      href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
      type: 'text/css',
    },
  ],

  onBrokenLinks: 'throw',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  themes: [
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        indexBlog: true,
        indexDocs: true,
        indexPages: false,
        language: ['en'],
      },
    ],
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/dtymoszenko/budgeting-project/tree/main/packages/create-docusaurus/templates/shared/',
        },
        blog: {
          blogSidebarTitle: 'All Posts',
          showReadingTime: true,
          feedOptions: {
            type: ['rss', 'atom'],
            xslt: true,
          },
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/dtymoszenko/budgeting-project/tree/main/packages/create-docusaurus/templates/shared/',
          // Useful options to enforce blogging best practices
          onInlineTags: 'warn',
          onInlineAuthors: 'warn',
          onUntruncatedBlogPosts: 'warn',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // Replace with your project's social card
    image: 'img/docusaurus-social-card.jpg',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'FlyBudget',
      logo: {
        alt: 'FlyBudget Logo',
        src: 'img/logo.png',
      },
      items: [
        {to: '/#features', label: 'Features', position: 'left', activeBaseRegex: '$^'},
        {to: '/tour', label: 'Tour', position: 'left'},
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Docs',
        },
        {to: '/blog', label: 'Blog', position: 'left'},
        {to: '/community', label: 'Community', position: 'left'},
        {to: '/contributing', label: 'Contributing', position: 'left'},
        {to: '/download', label: 'Download', position: 'left'},
        {
          href: 'https://github.com/dtymoszenko/budgeting-project',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {label: 'GitHub', href: 'https://github.com/dtymoszenko/budgeting-project'},
        {label: 'Website Source', href: 'https://github.com/dtymoszenko/budgeting-project'},
        {label: 'Privacy Policy', to: '/docs/intro'},
        {label: 'Blog', to: '/blog'},
      ],
      copyright: `Copyright © ${new Date().getFullYear()} FlyBudget. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
