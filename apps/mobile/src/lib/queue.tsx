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
};

type Ctx = {
  items: QueueItem[];
  /** Tamamlanan her fişte artar; ekranlar listeyi yenilemek için izler. */
  version: number;
  enqueue: (p: { reportId: string; companyId: string; userId: string; uri: string }) => void;
  retry: (key: string) => void;
  dismiss: (key: string) => void;
};

const QueueContext = createContext<Ctx | null>(null);
const CONCURRENCY = 2;

export function QueueProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [version, setVersion] = useState(0);
  const itemsRef = useRef<QueueItem[]>([]);
  const running = useRef(0);

  const update = useCallback((key: string, patch: Partial<QueueItem>) => {
    itemsRef.current = itemsRef.current.map((i) => (i.key === key ? { ...i, ...patch } : i));
    setItems(itemsRef.current);
  }, []);

  const pump = useCallback(() => {
    while (running.current < CONCURRENCY) {
      const next = itemsRef.current.find((i) => i.status === 'waiting');
      if (!next) return;
      running.current += 1;
      update(next.key, { status: 'uploading' });
      (async () => {
        try {
          const expenseId = await uploadReceipt(next);
          update(next.key, { status: 'reading', expenseId });
          setVersion((v) => v + 1);
          const read = await readReceipt(expenseId);
          update(next.key, { status: 'done', readError: read.error });
        } catch (e) {
          update(next.key, { status: 'failed', error: errorText(e) });
        } finally {
          running.current -= 1;
          setVersion((v) => v + 1);
          // Tamamlananlar listeden düşer; liste veritabanından yenilenir
          itemsRef.current = itemsRef.current.filter((i) => i.status !== 'done');
          setItems(itemsRef.current);
          pump();
        }
      })();
    }
  }, [update]);

  const enqueue = useCallback<Ctx['enqueue']>(
    (p) => {
      const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      itemsRef.current = [...itemsRef.current, { ...p, key, status: 'waiting' }];
      setItems(itemsRef.current);
      pump();
    },
    [pump],
  );

  const retry = useCallback(
    (key: string) => {
      update(key, { status: 'waiting', error: undefined });
      pump();
    },
    [pump, update],
  );

  const dismiss = useCallback((key: string) => {
    itemsRef.current = itemsRef.current.filter((i) => i.key !== key);
    setItems(itemsRef.current);
  }, []);

  const value = useMemo(() => ({ items, version, enqueue, retry, dismiss }), [items, version, enqueue, retry, dismiss]);
  return <QueueContext.Provider value={value}>{children}</QueueContext.Provider>;
}

export function useQueue() {
  const ctx = useContext(QueueContext);
  if (!ctx) throw new Error('useQueue QueueProvider içinde kullanılmalı');
  return ctx;
}
