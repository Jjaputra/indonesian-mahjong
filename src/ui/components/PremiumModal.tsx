import { getConfig } from '../../net/config';
import { Modal } from './Modal';

/** "Premium · segera hadir": an announcement only, with no payment, price or sign-up. */
export function PremiumModal({ onClose }: { onClose: () => void }) {
  const { dailyMatchLimit } = getConfig();
  return (
    <Modal
      title={<>maciokYU! Premium <span className="premium-badge">Segera hadir</span></>}
      onClose={onClose}
      footer={<button type="button" className="btn btn-primary" onClick={onClose}>Oke</button>}
    >
      <div className="premium-modal">
        <p>Main bareng teman tanpa batas harian. Tanpa Premium, host bisa memulai {dailyMatchLimit} match online per hari; teman yang join tetap gratis.</p>
        <p className="muted">Fitur lain menyusul.</p>
      </div>
    </Modal>
  );
}
