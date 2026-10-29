// Uygulama tanıtımı: kişinin rollerine göre bölümler; her bölüm bir kez gösterilir (profiles.tour_seen).
// Saf veri ve fonksiyonlar (testlerde Node ile çalışır).

export type TourKey = 'basics' | 'approver' | 'accountant' | 'payer' | 'admin' | 'bureau';
export type MockKind = 'welcome' | 'capture' | 'multi' | 'check' | 'track' | 'iban' | 'approve' | 'accounting' | 'pay' | 'setup' | 'bureau';

export type TourPage = { key: TourKey; mock: MockKind; who: string; title: string; text: string; where: string };

export const ORDER: TourKey[] = ['basics', 'approver', 'accountant', 'payer', 'admin', 'bureau'];

export const PAGES: TourPage[] = [
  { key: 'basics', mock: 'welcome', who: 'Hoş geldiniz', title: 'Masraflarınız raporlarda toplanır', text: 'Bir rapor bir iş ya da bir aydır: "Ekim masrafları", "İzmir fuarı". Fişleri rapora eklersiniz, rapor onaydan geçer, muhasebe aktarır, size ödenir.', where: 'Bu tanıtımı sonra Hesabım > Uygulamayı tanıt ile yeniden açabilirsiniz.' },
  { key: 'basics', mock: 'capture', who: 'Fiş girmek', title: 'Ana ekrandaki yeşil kart: Fiş çek', text: 'Fişin fotoğrafını çekin ya da "Galeriden ekle" ile birden çok fotoğraf seçin. Açık raporunuz yoksa önce "Yeni rapor aç" der, başlığı yazarsınız.', where: 'Ana ekran, en üstteki yeşil kart' },
  { key: 'basics', mock: 'multi', who: 'Zaman kazanın', title: 'Beş fişi tek fotoğrafta çekin', text: 'Fişleri masaya yan yana koyun, bir kez çekin. Gidero her fişi ayrı okur ve ayrı kayıt açar. Bir fotoğrafta en çok 5 fiş.', where: 'Fiş çek ya da Galeriden ekle' },
  { key: 'basics', mock: 'check', who: 'Kontrol', title: 'Turuncu kutuları fişe bakıp doldurun', text: 'Gidero tutarı, tarihi, satıcıyı ve KDV\'yi okur. Okunamayan alan turuncu görünür. Bilgileri fotoğrafla karşılaştırın, "Doğru, sıradaki fiş" deyin. Kontrol edilmemiş fiş onaya gitmez.', where: 'Raporda fişe dokunun' },
  { key: 'basics', mock: 'track', who: 'Gönder ve takip et', title: 'Onaya gönderin, kimde olduğunu görün', text: 'Raporda "Onaya gönder" deyin. Raporun üstündeki akış şeması kimde beklediğini gösterir. Geri gönderilirse nedenini, ödendiğinde "Masrafınız ödendi" bildirimini görürsünüz.', where: 'Ana ekran > Raporlarım' },
  { key: 'basics', mock: 'iban', who: 'Ödeme', title: 'IBAN\'ınızı bir kez girin', text: 'Masraflarınız bu hesaba ödenir. IBAN\'ı yalnızca siz, muhasebe ve ödeme yetkilisi görür.', where: 'Hesabım > Masraf ödemem için banka bilgim' },
  { key: 'approver', mock: 'approve', who: 'Onaylayıcı', title: 'Onayınızı bekleyen raporlar ana ekranda', text: 'Kartı açın, rapora dokunun. Özet ekranında gider grubu toplamları, kimlerle, uyarılar görünür. "Onayla" deyin ya da not yazıp "Geri gönder". Kendi raporunuz sizin üstünüze gider.', where: 'Ana ekran > Onayınızı bekleyen rapor' },
  { key: 'accountant', mock: 'accounting', who: 'Muhasebe', title: 'Onaylanan raporlar muhasebe masasına düşer', text: 'Fişleri kontrol edin, alkol kararını verin. "Döküm al ve aktar" ile Excel, Logo ya da Luca dosyasını alın. Raporu "Yazdır ve PDF" ile fiş görselleriyle birlikte basabilirsiniz.', where: 'Ana ekran > Muhasebe masası' },
  { key: 'accountant', mock: 'pay', who: 'Muhasebe', title: 'Ödemeyi finansa aktarın', text: 'Ödenecek raporları seçip "Finans: ödeme sorumlusuna aktar" deyin. Ödeme yetkilisi ödeyince rapor arşive kalkar.', where: 'Muhasebe masası' },
  { key: 'payer', mock: 'pay', who: 'Ödeme yetkilisi', title: 'Kime, ne kadar, hangi IBAN', text: 'Ana ekrandaki "Ödeme bekleyen rapor" kartından Ödemeler\'e girin. IBAN ve tutarı tek dokunuşla kopyalayın, bankadan ödeyin, sonra "Ödeme yapıldı" deyin. Çalışana bildirim gider.', where: 'Ana ekran > Ödeme bekleyen rapor' },
  { key: 'admin', mock: 'setup', who: 'Şirket yöneticisi', title: 'Şirketinizi üç adımda kurun', text: '"Ekibi yönet" ile kişileri ekleyin ve rollerini verin. "Onay zinciri"nde kimin kime bağlı olduğunu sürükleyip bırakın, son onayı işaretleyin. "Gider grupları ve sınırlar" ile kuralları koyun.', where: 'Ana ekranın alt kısmı; logo ve renkler Ayarlar\'da' },
  { key: 'bureau', mock: 'bureau', who: 'Muhasebe bürosu', title: 'Firma seçin, fişleri toplu yükleyin', text: 'Üstteki "Çalıştığınız firma"dan müşteri firmayı seçin. "Toplu yükleme" ile WhatsApp sohbet ZIP\'ini, PDF ve e-Fatura XML\'leri tek seferde yükleyin; kontrol edip "Kayda al" deyin.', where: 'Ana ekran > Toplu yükleme; firmalar Müşteri firmalar\'da' },
];

export type RoleInfo = { roles: string[]; bureau: boolean; hasCompany: boolean };

/** Kişinin görmesi gereken bölümler */
export function sectionsFor(r: RoleInfo): TourKey[] {
  const out: TourKey[] = [];
  const has = (x: string) => r.roles.includes(x);
  if (r.hasCompany || r.bureau) out.push('basics');
  if (has('approver')) out.push('approver');
  if (has('accountant')) out.push('accountant');
  if (has('payer')) out.push('payer');
  if (has('admin')) out.push('admin');
  if (r.bureau) out.push('bureau');
  return out;
}

/** Henüz görülmemiş bölümlerin sayfaları; hepsi görüldüyse boş */
export function pendingPages(sections: TourKey[], seen: string[], all = false): TourPage[] {
  const want = new Set(all ? sections : sections.filter((s) => !seen.includes(s)));
  // Yeni bir rol eklendiyse temel sayfalar tekrar gösterilmez, yalnızca o rolün sayfası
  return PAGES.filter((p) => want.has(p.key));
}
