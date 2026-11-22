# Copy guide

How maciokYU! talks to players. Every agent follows it for player-facing text (UI, toasts, errors, legal pages, release notes for the group). Jason chose this voice on 2026-11-22: "santai tanpa sapaan".

## Voice
- **Like a relaxed admin of a mahjong WhatsApp group.** Short and clear, and it knows the table.
- **Hardly any pronoun.** Write "Jatah host hari ini abis", not "Jatah host Anda hari ini sudah habis". If one is really needed, use **kamu**. Never "Anda", never "lu/gw", never "kalian".
- **Everyday Indonesian, not translated English.** Use words like "udah", "abis", "lagi", "nggak", "nunggu" and "bentar". Not "sedang", "telah", "silakan", "harap" or "mohon".
- **Table words stay as players say them:** Hu, Pung, Jia, Kong, Kim, Tay, koin, kit-kit, Ce Mo, Lew Fit, Seri, dealer, tembok, buangan, bunga. Say "tile", never "ubin" (see `AGENTS.md`).
- **Say what happened and what to do next.** Every error has a next step: "Kodenya nggak ketemu. Cek lagi atau minta link baru."

## Don't
- **No slogans or poetry:** "Satu meja, empat sahabat.", "Anda dan tiga lawan. Satu meja.", "Rasakan serunya…", "Nikmati…", "Siap untuk…?"
- **No filler:** "Fitur lain menyusul.", "Permainan segera dimulai...", "dengan mudah", "secara otomatis", "seamless", "pengalaman bermain".
- **No stacked politeness:** "Silakan", "Mohon maaf", "Terima kasih atas…", "Harap".
- **Punctuation:** no exclamation mark unless it's a real moment (Hu!, juara). Never "!!" and no emoji in UI text. Reactions are the exception.
- **No three-part lists for rhythm**, and no "bukan hanya X, tapi juga Y".
- **No bureaucratic words:** "perangkat" → "tab atau HP lain" (a second tab counts too), "pengguna" → "pemain", "tautan" → "link", "melakukan", "terkait", "guna".

## Glossary (use exactly these words)

| Use | Not |
| --- | --- |
| Buat room / Gabung room | Mode pemain tunggal / Mode multipemain |
| room, kode room, link undangan | ruang, tautan |
| Masuk pakai Google / Keluar | Login dengan akun Google / Sign out |
| jatah host (3 match sehari) | kuota, batas harian |
| tab atau HP lain | perangkat lain |
| Lanjut / Main lagi / Keluar room / Ke menu | Lanjutkan permainan / Mulai ulang / Kembali ke menu |
| Klasemen akhir | Peringkat akhir pertandingan |
| Riwayat | Histori |

## Lengths
- **Buttons:** 1–3 words, verb first ("Buat room", "Gabung", "Main lagi").
- **Toasts and status:** one line, 60 characters at most.
- **Explanations under a setting:** one sentence that says what changes at the table.

## Legal pages
Plain and true to the code (see 1.3.2). Same voice with "kamu", short sentences, no legal filler. Precision still wins over style there.
