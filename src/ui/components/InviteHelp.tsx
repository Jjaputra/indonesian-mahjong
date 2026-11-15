import { Modal } from './Modal';

const STEPS = [
  'Buat Room, lalu atur aturannya.',
  'Tekan Bagikan atau WhatsApp untuk mengirim tautan ke grup.',
  'Teman membuka tautan, mengetik nama, dan memilih kursi.',
  'Kursi kosong bisa diisi bot; host menekan Mulai.',
  'Kalau koneksi putus, buka tautan yang sama lagi untuk kembali ke kursi Anda.',
];

const LIMITS = [
  'Satu perangkat per kursi.',
  'Kursi diingat oleh browser ini.',
  'Waktu giliran tetap berjalan saat Anda offline.',
  'Room kosong dihapus setelah 24 jam.',
];

export function InviteHelp({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Cara undang teman" onClose={onClose} footer={<button type="button" className="btn btn-primary" onClick={onClose}>Mengerti</button>}>
      <ol className="mp-help-steps">{STEPS.map(step => <li key={step}>{step}</li>)}</ol>
      <h3 className="mp-help-sub">Batas versi ini</h3>
      <ul className="mp-help-limits">{LIMITS.map(limit => <li key={limit}>{limit}</li>)}</ul>
    </Modal>
  );
}
