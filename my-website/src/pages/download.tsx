import type {ReactNode} from 'react';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

export default function Download(): ReactNode {
  return (
    <Layout title="Download" description="Download FlyBudget">
      <main style={{padding: '4rem 2rem', maxWidth: 800, margin: '0 auto'}}>
        <Heading as="h1">Download</Heading>
        <p>Coming soon — download links for FlyBudget.</p>
      </main>
    </Layout>
  );
}
