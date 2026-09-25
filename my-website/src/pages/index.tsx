import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

function HeroSection(): ReactNode {
  return (
    <header className={styles.hero}>
      <div className={styles.heroContainer}>
        <div className={styles.heroGrid}>
          <div className={styles.heroText}>
            <Heading as="h1" className={styles.heroHeadline}>
              <span className={styles.headlineWhite}>Your money.</span>
              <span className={styles.headlineWhite}>Your data.</span>
              <span className={styles.headlineBlue}>Your rules.</span>
            </Heading>
            <p className={styles.heroDescription}>
              A fast, open-source budgeting app that gives you complete control
              over your financial data.
            </p>
            <div className={styles.ctaRow}>
              <Link className={styles.ctaPrimary} to="/docs/intro">
                Get Started <span aria-hidden="true">&rarr;</span>
              </Link>
              <Link
                className={styles.ctaSecondary}
                href="https://github.com/dtymoszenko/budgeting-project"
              >
                <svg
                  className={styles.githubIcon}
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                </svg>
                GitHub
              </Link>
            </div>
            <div className={styles.attributeRow}>
              <div className={styles.attribute}>
                <svg
                  className={styles.attributeIcon}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
                Open source
              </div>
              <span className={styles.attributeDot} aria-hidden="true">
                &middot;
              </span>
              <div className={styles.attribute}>
                <svg
                  className={styles.attributeIcon}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
                Local-first
              </div>
              <span className={styles.attributeDot} aria-hidden="true">
                &middot;
              </span>
              <div className={styles.attribute}>
                <svg
                  className={styles.attributeIcon}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                  <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                  <line x1="6" y1="6" x2="6.01" y2="6" />
                  <line x1="6" y1="18" x2="6.01" y2="18" />
                </svg>
                Self-hostable
              </div>
            </div>
          </div>
          <div className={styles.heroImageWrapper}>
            <img
              src="/img/logo.png"
              alt="FlyBudget — flying money illustration"
              className={styles.heroImage}
              width="480"
              height="480"
            />
          </div>
        </div>
      </div>
    </header>
  );
}

function IntroSection(): ReactNode {
  return (
    <section className={styles.intro}>
      <div className={styles.introContainer}>
        <Heading as="h2" className={styles.introHeading}>
          Everything you need to understand where your money goes.
        </Heading>
        <p className={styles.introDescription}>
          Track spending, set budgets, reach your goals, and take control of
          your financial future.
        </p>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout description={siteConfig.tagline}>
      <HeroSection />
      <main>
        <IntroSection />
      </main>
    </Layout>
  );
}
