import { Modal } from './Modal';

const STEPS = [
  'Buat room, lalu atur aturannya.',
  'Tekan Bagikan atau WhatsApp buat kirim link ke grup.',
  'Teman buka link, isi nama, lalu pilih kursi.',
  'Kursi kosong bisa diisi bot. Host tekan Mulai.',
  'Kalau koneksi putus, buka link yang sama lagi buat balik ke kursi.',
];

const LIMITS = [
  'Satu kursi cuma bisa dibuka di satu tab atau HP.',
  'Kursi diingat browser ini.',
  'Waktu giliran tetap jalan walau offline.',
  'Room kosong dihapus setelah 24 jam.',
];

export function InviteHelp({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Cara undang teman" onClose={onClose} footer={<button type="button" className="btn btn-primary" onClick={onClose}>Oke</button>}>
      <ol className="mp-help-steps">{STEPS.map(step => <li key={step}>{step}</li>)}</ol>
      <h3 className="mp-help-sub">Batasan saat ini</h3>
      <ul className="mp-help-limits">{LIMITS.map(limit => <li key={limit}>{limit}</li>)}</ul>
    </Modal>
  );
}
