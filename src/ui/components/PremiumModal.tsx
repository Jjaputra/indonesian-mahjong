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
        <p>Premium: host main bareng tanpa jatah harian. Tanpa Premium, jatah host {dailyMatchLimit} match online per hari. Teman yang gabung tetap gratis.</p>
      </div>
    </Modal>
  );
}
