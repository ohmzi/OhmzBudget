import type {ReactNode} from 'react';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

export default function Tour(): ReactNode {
  return (
    <Layout title="Tour" description="See FlyBudget in action">
      <main style={{padding: '4rem 2rem', maxWidth: 800, margin: '0 auto'}}>
        <Heading as="h1">Tour</Heading>
        <p>Coming soon — screenshots and a walkthrough of FlyBudget.</p>
      </main>
    </Layout>
  );
}
