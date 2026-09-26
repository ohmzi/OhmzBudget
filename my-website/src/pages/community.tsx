import type {ReactNode} from 'react';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

export default function Community(): ReactNode {
  return (
    <Layout title="Community" description="Join the FlyBudget community">
      <main style={{padding: '4rem 2rem', maxWidth: 800, margin: '0 auto'}}>
        <Heading as="h1">Community</Heading>
        <p>Coming soon — join the FlyBudget community.</p>
      </main>
    </Layout>
  );
}
