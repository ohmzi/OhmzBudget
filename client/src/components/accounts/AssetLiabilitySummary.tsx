import { useMemo } from 'react';
import { formatCurrency } from '../../utils/currency';
import { chartColors } from '../../utils/chartColors';
import type { Account } from '../../types';

const COLORS = {
  cash: chartColors.positive,
  investment: '#7C3AED',
  credit: chartColors.negative,
};

interface Props {
  accounts: Account[];
}

export function AssetLiabilitySummary({ accounts }: Props) {
  const { cashTotal, investmentTotal, creditTotal, assetsTotal, liabilitiesTotal } = useMemo(() => {
    let cash = 0;
    let invest = 0;
    let credit = 0;
    for (const a of accounts) {
      if (a.type === 'credit') credit += a.balance;
      else if (a.type === 'investment') invest += a.balance;
      else cash += a.balance;
    }
    return {
      cashTotal: cash,
      investmentTotal: invest,
      creditTotal: credit,
      assetsTotal: cash + invest,
      liabilitiesTotal: Math.abs(credit),
    };
  }, [accounts]);

  const investPct = assetsTotal > 0 ? (investmentTotal / assetsTotal) * 100 : 0;
  const cashPct = assetsTotal > 0 ? (cashTotal / assetsTotal) * 100 : 0;

  return (
    <div>
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-text">Assets</span>
          <span className="text-sm font-semibold tabular-nums text-text">
            {formatCurrency(assetsTotal)}
          </span>
        </div>

        {assetsTotal > 0 && (
          <div className="h-3 flex rounded-full overflow-hidden mt-2">
            {investmentTotal > 0 && (
              <div
                className="h-full"
                style={{ width: `${investPct}%`, backgroundColor: COLORS.investment }}
              />
            )}
            {cashTotal > 0 && (
              <div
                className="h-full"
                style={{ width: `${cashPct}%`, backgroundColor: COLORS.cash }}
              />
            )}
          </div>
        )}

        <div className="mt-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: COLORS.investment }}
              />
              <span className="text-sm text-text-secondary">Investments</span>
            </div>
            <span className="text-sm tabular-nums text-text">
              {formatCurrency(investmentTotal)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: COLORS.cash }}
              />
              <span className="text-sm text-text-secondary">Cash</span>
            </div>
            <span className="text-sm tabular-nums text-text">{formatCurrency(cashTotal)}</span>
          </div>
        </div>
      </div>

      <div className="border-t border-border-light my-4" />

      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-text">Liabilities</span>
          <span className="text-sm font-semibold tabular-nums text-text">
            {formatCurrency(creditTotal)}
          </span>
        </div>

        {liabilitiesTotal > 0 && (
          <div className="h-3 rounded-full overflow-hidden mt-2">
            <div
              className="h-full rounded-full"
              style={{ width: '100%', backgroundColor: COLORS.credit }}
            />
          </div>
        )}

        <div className="mt-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: COLORS.credit }}
              />
              <span className="text-sm text-text-secondary">Credit Cards</span>
            </div>
            <span className="text-sm tabular-nums text-text">{formatCurrency(creditTotal)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
