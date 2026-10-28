import type { ReactNode } from 'react';

/** Telefonda sürükleme yok: kişi seçilip "Altına taşı" ile bağlanır. */
export function DragNode({ children }: { id: string; draggable?: boolean; onDropOn: (sourceId: string) => void; children: ReactNode }) {
  return <>{children}</>;
}

export const dragSupported = false;
