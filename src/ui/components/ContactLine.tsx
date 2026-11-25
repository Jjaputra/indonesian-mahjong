// Feedback contact shown after a match and in Settings. One place to change the address later.
export const CONTACT_EMAIL = 'maciokyu@gmail.com';

export function ContactLine() {
  return (
    <p className="contact-line">
      Ada masukan atau nemu bug? Kirim ke <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Masukan maciokYU!')}`}>{CONTACT_EMAIL}</a>
      <small className="contact-legal"><a href="legal/privasi.html" target="_blank" rel="noopener">Kebijakan Privasi</a> · <a href="legal/syarat.html" target="_blank" rel="noopener">Syarat Layanan</a></small>
    </p>
  );
}
