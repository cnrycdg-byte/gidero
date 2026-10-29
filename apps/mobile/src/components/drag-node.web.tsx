import { useState, type ReactNode } from 'react';

const TYPE = 'text/gidero-person';

/** Bilgisayarda sürükle bırak: bir kişiyi başka bir kişinin üstüne bırakınca onun altına bağlanır. */
export function DragNode({ id, draggable = dragSupported, onDropOn, children }: { id: string; draggable?: boolean; onDropOn: (sourceId: string) => void; children: ReactNode }) {
  const [over, setOver] = useState(false);
  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData(TYPE, id);
        e.dataTransfer.effectAllowed = 'move';
        e.stopPropagation();
      }}
      onDragOver={(e) => {
        if (!Array.from(e.dataTransfer.types).includes(TYPE)) return;
        e.preventDefault();
        e.stopPropagation();
        if (!over) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        const src = e.dataTransfer.getData(TYPE);
        if (!src) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        if (src !== id) onDropOn(src);
      }}
      style={{
        borderRadius: 18,
        outline: over ? '3px dashed #12806F' : '3px solid transparent',
        outlineOffset: 2,
        cursor: draggable ? 'grab' : 'default',
        display: 'flex',
        flexDirection: 'column',
      }}>
      {children}
    </div>
  );
}

// Dokunmatik tarayıcılarda (telefon, tablet) sürükle bırak çalışmaz; orada "Altına taşı" kullanılır
export const dragSupported = typeof window === 'undefined' || !window.matchMedia?.('(pointer: coarse)').matches;
