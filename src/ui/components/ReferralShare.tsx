import { useEffect, useState } from 'react';
import { shareReferral, useAccount } from '../../net/auth';

export const SHARE_THANKS = 'Makasih udah ngajak! +1 match hari ini.';
export function ReferralShare({ onError, onToast }: { onError: (message: string) => void; onToast?: (message: string) => void }) {
  const account = useAccount();
  const [busy, setBusy] = useState(false), [toast, setToast] = useState(false);
  useEffect(() => { if (toast) { const id = setTimeout(() => setToast(false), 5000); return () => clearTimeout(id); } }, [toast]);
  if (!account) return null;
  return <span className="mp-referral-share"><button type="button" className="mp-link" disabled={busy || !account.referralCode} onClick={() => {
    setBusy(true);
    void shareReferral().then(granted => { if (granted) { if (onToast) onToast(SHARE_THANKS); else setToast(true); } }).catch(error => onError(error.message)).finally(() => setBusy(false));
  }}>{account.sharedToday || account.premium ? 'Bagikan ke WA' : 'Bagikan ke WA (+1 match)'}</button>
    {toast && <span className="mp-referral-toast" role="status">{SHARE_THANKS}</span>}
  </span>;
}
