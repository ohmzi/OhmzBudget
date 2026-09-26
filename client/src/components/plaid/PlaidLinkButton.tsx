import { useCallback } from 'react';
import { usePlaidLink, type PlaidLinkOnSuccess } from 'react-plaid-link';
import { Building2 } from 'lucide-react';

interface Props {
  linkToken: string;
  onSuccess: (publicToken: string, metadata: any) => void;
  children?: React.ReactNode;
  className?: string;
}

export function PlaidLinkButton({ linkToken, onSuccess, children, className }: Props) {
  const onPlaidSuccess = useCallback<PlaidLinkOnSuccess>(
    (publicToken, metadata) => {
      if (publicToken) onSuccess(publicToken, metadata);
    },
    [onSuccess],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: onPlaidSuccess,
  });

  return (
    <button
      onClick={() => open()}
      disabled={!ready}
      className={
        className ??
        'flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-brand-600 rounded-md hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
      }
    >
      <Building2 size={16} />
      {children ?? 'Connect Bank'}
    </button>
  );
}
