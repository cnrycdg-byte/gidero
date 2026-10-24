import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

import { readReceipt, uploadReceipt } from './receipts';
import { errorText } from './supabase';

// Seri çekimde her fotoğraf sıraya girer; yükleme ve okuma arka planda yapılır, kullanıcı çekmeye devam eder.
export type QueueItem = {
  key: string;
  reportId: string;
  companyId: string;
  userId: string;
  uri: string;
  status: 'waiting' | 'uploading' | 'reading' | 'done' | 'failed';
  error?: string;
  expenseId?: string;
  readError?: string | null;
  startedAt?: number;
  finishedAt?: number;
};

export type Progress = {
  /** Bu partideki toplam fiş */
  total: number;
  /** Biten (okunan veya hata veren) */
  finished: number;
  /** Kalan tahmini süre (saniye); hesaplanamıyorsa null */
  etaSeconds: number | null;
  active: boolean;
};

type Ctx = {
  items: QueueItem[];
  /** Her durum değişikliğinde artar; ekranlar listeyi yenilemek için izler. */
  version: number;
  enqueue: (p: { reportId: string; companyId: string; userId: string; uri: string }) => void;
  retry: (key: string) => void;
  dismiss: (key: string) => void;
  /** Bir raporun (verilmezse tümünün) ilerlemesi */
  progress: (reportId?: string, now?: number) => Progress;
};

const QueueContext = createContext<Ctx | null>(null);
const CONCURRENCY = 3;
/** İlk tahmin: bir fişin yüklenip okunması (ölçüldükçe güncellenir) */
const DEFAULT_MS = 9000;

export function QueueProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [version, setVersion] = useState(0);
  const itemsRef = useRef<QueueItem[]>([]);
  const running = useRef(0);
  const avgMs = useRef(DEFAULT_MS);

  const commit = useCallback(() => {
    // Partideki her fiş bitince (hata vermeyenler) listeden düşer; ilerleme çubuğu o ana kadar tam görünür
    const live = itemsRef.current.filter((i) => i.status !== 'done' && i.status !== 'failed');
    if (live.length === 0) itemsRef.current = itemsRef.current.filter((i) => i.status === 'failed');
    setItems([...itemsRef.current]);
  }, []);

  const update = useCallback(
    (key: string, patch: Partial<QueueItem>) => {
      itemsRef.current = itemsRef.current.map((i) => (i.key === key ? { ...i, ...patch } : i));
      commit();
    },
    [commit],
  );

  const pump = useCallback(() => {
    while (running.current < CONCURRENCY) {
      const next = itemsRef.current.find((i) => i.status === 'waiting');
      if (!next) return;
      running.current += 1;
      const started = Date.now();
      update(next.key, { status: 'uploading', startedAt: started });
      (async () => {
        try {
          const expenseId = await uploadReceipt(next);
          update(next.key, { status: 'reading', expenseId });
          setVersion((v) => v + 1);
          const read = await readReceipt(expenseId);
          const took = Date.now() - started;
          avgMs.current = Math.round(avgMs.current * 0.6 + took * 0.4);
          update(next.key, { status: 'done', readError: read.error, finishedAt: Date.now() });
        } catch (e) {
          update(next.key, { status: 'failed', error: errorText(e), finishedAt: Date.now() });
        } finally {
          running.current -= 1;
          setVersion((v) => v + 1);
          pump();
        }
      })();
    }
  }, [update]);

  const enqueue = useCallback<Ctx['enqueue']>(
    (p) => {
      const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      itemsRef.current = [...itemsRef.current, { ...p, key, status: 'waiting' }];
      commit();
      pump();
    },
    [pump, commit],
  );

  const retry = useCallback(
    (key: string) => {
      update(key, { status: 'waiting', error: undefined, startedAt: undefined, finishedAt: undefined });
      pump();
    },
    [pump, update],
  );

  const dismiss = useCallback(
    (key: string) => {
      itemsRef.current = itemsRef.current.filter((i) => i.key !== key);
      commit();
    },
    [commit],
  );

  const progress = useCallback(
    (reportId?: string, now = Date.now()): Progress => {
      const list = items.filter((i) => !reportId || i.reportId === reportId);
      const total = list.length;
      const finished = list.filter((i) => i.status === 'done' || i.status === 'failed').length;
      const inFlight = list.filter((i) => i.status === 'uploading' || i.status === 'reading');
      const waiting = list.filter((i) => i.status === 'waiting').length;
      const active = inFlight.length + waiting > 0;
      if (!active) return { total, finished, etaSeconds: null, active };
      const avg = avgMs.current;
      // Çalışanların kalan süresi + sıradakilerin eşzamanlı işlenme süresi
      const inFlightRemaining = inFlight.map((i) => Math.max(1000, avg - (now - (i.startedAt ?? now))));
      const longest = inFlightRemaining.length ? Math.max(...inFlightRemaining) : 0;
      const waves = Math.ceil(waiting / CONCURRENCY);
      const etaMs = longest + waves * avg;
      return { total, finished, etaSeconds: Math.max(1, Math.round(etaMs / 1000)), active };
    },
    [items],
  );

  const value = useMemo(
    () => ({ items, version, enqueue, retry, dismiss, progress }),
    [items, version, enqueue, retry, dismiss, progress],
  );
  return <QueueContext.Provider value={value}>{children}</QueueContext.Provider>;
}

export function useQueue() {
  const ctx = useContext(QueueContext);
  if (!ctx) throw new Error('useQueue QueueProvider içinde kullanılmalı');
  return ctx;
}

/** "Yaklaşık 25 sn" / "Yaklaşık 1 dk 10 sn" */
export function etaText(seconds: number | null): string {
  if (seconds == null) return '';
  if (seconds < 60) return `Yaklaşık ${seconds} sn`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `Yaklaşık ${m} dk ${s} sn` : `Yaklaşık ${m} dk`;
}
