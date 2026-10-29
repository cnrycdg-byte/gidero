import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

import { dominantColor } from './colors';

/** Logonun herkese açık adresi */
export function logoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from('logos').getPublicUrl(path).data.publicUrl;
}

/** Galeriden logo seçer; yoksa null */
export async function pickLogo(): Promise<string | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsMultipleSelection: false });
  if (res.canceled || !res.assets?.length) return null;
  return res.assets[0].uri;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Logoyu 512 piksele küçültür, PNG (saydamlık korunur) olarak şirketin klasörüne yükler, yolunu verir */
export async function uploadLogo(companyId: string, uri: string): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  ctx.resize({ width: 512 });
  const img = await ctx.renderAsync();
  const saved = await img.saveAsync({ format: SaveFormat.PNG, base64: true });
  if (!saved.base64) throw new Error('Logo hazırlanamadı. Başka bir dosya deneyin.');
  const bytes = base64ToBytes(saved.base64);
  if (bytes.length > 1_000_000) throw new Error('Logo 1 MB’den büyük. Daha küçük bir dosya seçin.');
  const path = `${companyId}/logo-${Date.now().toString(36)}.png`;
  const { error } = await supabase.storage.from('logos').upload(path, bytes, { contentType: 'image/png', upsert: false });
  if (error) throw error;
  return path;
}

/** Web'de logodaki baskın rengi bulur (renk önerisi için); telefonda null */
export async function colorFromLogo(uri: string): Promise<string | null> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return null;
  return new Promise((resolve) => {
    const img = new (globalThis as any).Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const w = 64;
        const h = Math.max(1, Math.round((img.height / img.width) * w));
        canvas.width = w;
        canvas.height = h;
        const g = canvas.getContext('2d');
        if (!g) return resolve(null);
        g.drawImage(img, 0, 0, w, h);
        resolve(dominantColor(g.getImageData(0, 0, w, h).data));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = uri;
  });
}
