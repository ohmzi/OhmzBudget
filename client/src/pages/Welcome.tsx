import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Building2, Link2, Plus, Loader2 } from 'lucide-react';
import logoUrl from '/logo.png';
import { useAccounts } from '../hooks/useAccounts';
import { usePlaidStatus } from '../hooks/usePlaid';
import { useAppStore } from '../store/appStore';
import { AddAccountModal } from '../components/accounts/AddAccountModal';
import { ConnectBankModal } from '../components/plaid/ConnectBankModal';
import { PlaidSetupModal } from '../components/plaid/PlaidSetupModal';
import { SimplefinConnectModal } from '../components/simplefin/SimplefinConnectModal';

export default function WelcomePage() {
  const { data: accounts = [], isLoading } = useAccounts();
  const { data: plaidStatus } = usePlaidStatus();
  const plaidConfigured = plaidStatus?.configured ?? false;
  const setSetupSkipped = useAppStore((s) => s.setSetupSkipped);
  const navigate = useNavigate();

  const [showPlaid, setShowPlaid] = useState(false);
  const [showPlaidSetup, setShowPlaidSetup] = useState(false);
  const [showSimplefin, setShowSimplefin] = useState(false);
  const [showManual, setShowManual] = useState(false);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-page">
        <Loader2 size={32} className="animate-spin text-text-tertiary" />
      </div>
    );
  }

  if (accounts.length > 0) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="h-screen flex items-center justify-center bg-page p-6">
      <div className="max-w-2xl w-full text-center">
        <img src={logoUrl} alt="Budget" className="w-16 h-16 mx-auto mb-6" />

        <h1 className="text-2xl font-semibold text-text">Welcome to your budget</h1>
        <p className="text-sm text-text-secondary mt-2 max-w-md mx-auto">
          Get started by connecting your bank for automatic imports, or add your accounts manually.
        </p>

        <div className="grid gap-4 mt-8 grid-cols-1 sm:grid-cols-3">
          <button
            onClick={() => {
              if (plaidConfigured) setShowPlaid(true);
              else setShowPlaidSetup(true);
            }}
            className="group relative bg-surface border-2 border-brand-200 hover:border-brand-500 hover:shadow-hover rounded-xl p-6 text-left transition-all duration-200"
          >
            <span className="absolute top-3 right-3 border border-brand-500 text-brand-700 text-[10px] font-medium px-2 py-0.5 rounded-md">
              Suggested
            </span>
            <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center mb-4 group-hover:bg-brand-200 transition-colors duration-200">
              <Building2 size={20} className="text-brand-600" />
            </div>
            <h3 className="text-sm font-semibold text-text">Connect via Plaid</h3>
            <p className="text-xs text-text-tertiary mt-1 leading-relaxed">
              Connect your bank directly for automatic transaction import.
            </p>
          </button>

          <button
            onClick={() => setShowSimplefin(true)}
            className="group bg-surface border-2 border-emerald-200 hover:border-emerald-300 rounded-xl p-6 text-left transition-all duration-200 hover:shadow-hover"
          >
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center mb-4 group-hover:bg-emerald-100 transition-colors">
              <Link2 size={20} className="text-emerald-600" />
            </div>
            <h3 className="text-sm font-semibold text-text">Connect via SimpleFIN</h3>
            <p className="text-xs text-text-tertiary mt-1 leading-relaxed">
              Use SimpleFIN Bridge to import transactions. $1.50/month.
            </p>
          </button>

          <button
            onClick={() => setShowManual(true)}
            className="group bg-surface border-2 border-border hover:border-text-tertiary rounded-xl p-6 text-left transition-all duration-200 hover:shadow-hover"
          >
            <div className="w-10 h-10 rounded-lg bg-surface-alt flex items-center justify-center mb-4 group-hover:bg-hover transition-colors">
              <Plus size={20} className="text-text-secondary" />
            </div>
            <h3 className="text-sm font-semibold text-text">Add Manually</h3>
            <p className="text-xs text-text-tertiary mt-1 leading-relaxed">
              Create accounts and enter transactions by hand.
            </p>
          </button>
        </div>

        <button
          onClick={() => {
            setSetupSkipped(true);
            navigate('/dashboard');
          }}
          className="mt-6 text-sm text-text-tertiary hover:text-text-secondary transition-colors"
        >
          Add Later
        </button>

        <ConnectBankModal isOpen={showPlaid} onClose={() => setShowPlaid(false)} />
        <PlaidSetupModal
          isOpen={showPlaidSetup}
          onClose={() => setShowPlaidSetup(false)}
          onConfigured={() => setShowPlaid(true)}
        />
        <SimplefinConnectModal isOpen={showSimplefin} onClose={() => setShowSimplefin(false)} />
        <AddAccountModal isOpen={showManual} onClose={() => setShowManual(false)} />
      </div>
    </div>
  );
}
