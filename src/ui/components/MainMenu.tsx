export interface MainMenuProps {
  difficultyLabel: string;
  lastResult: string | null;
  onPractice: () => void;
  onCalculator: () => void;
}

export function MainMenu({ difficultyLabel, lastResult, onPractice, onCalculator }: MainMenuProps) {
  return (
    <main className="page">
      <h1>Mahjong Tradisional Indonesia</h1>
      <p>Latihan melawan tiga bot, aturan Bandung Mahjong Cup ver06. Anda duduk sebagai Timur.</p>
      {lastResult !== null && <p>Terakhir: {lastResult}</p>}
      <div className="menu-choices">
        <button type="button" className="btn btn-primary" onClick={onPractice}>
          Latihan <span>Tiga bot: {difficultyLabel}</span>
        </button>
        <button type="button" className="btn" onClick={onCalculator}>
          Kalkulator Tay <span>Periksa pola dan hitung Tay</span>
        </button>
      </div>
      <p className="muted small">Tingkat kesulitan dapat diubah melalui Pengaturan.</p>
    </main>
  );
}
