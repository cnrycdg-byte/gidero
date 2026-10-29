// Oturum içi tanıtım durumu: aynı oturumda tur bir kez açılır, kapatınca hemen "görüldü" sayılır
export const tourState: { seen: string[]; checked: string | null } = { seen: [], checked: null };
