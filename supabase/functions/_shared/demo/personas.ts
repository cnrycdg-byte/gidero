// Test modundaki deneme kişileri. E-postalar gerçek değildir (example.com hiçbir zaman e-posta almaz).
// Uygulamadaki açıklamalar apps/mobile/src/lib/demo.ts içinde; anahtarlar ikisinde aynı olmalı.
export type Persona = { key: string; name: string; email: string };

export const PERSONAS: Persona[] = [
  { key: 'buro_sahibi', name: 'Ayşe Demir', email: 'gidero.demo.buro.sahibi@example.com' },
  { key: 'buro_muhasebeci', name: 'Can Yıldız', email: 'gidero.demo.buro.muhasebeci@example.com' },
  { key: 'musteri_calisan', name: 'Burak Öztürk', email: 'gidero.demo.musteri.calisan@example.com' },
  { key: 'sirket_yonetici', name: 'Mehmet Kaya', email: 'gidero.demo.sirket.yonetici@example.com' },
  { key: 'bolge_muduru', name: 'Emre Şahin', email: 'gidero.demo.bolge.muduru@example.com' },
  { key: 'calisan', name: 'Ali Çelik', email: 'gidero.demo.calisan@example.com' },
  { key: 'calisan2', name: 'Elif Koç', email: 'gidero.demo.calisan2@example.com' },
  { key: 'sirket_muhasebeci', name: 'Zeynep Arslan', email: 'gidero.demo.sirket.muhasebeci@example.com' },
];

export const findPersona = (key: unknown) => PERSONAS.find((p) => p.key === key) ?? null;
