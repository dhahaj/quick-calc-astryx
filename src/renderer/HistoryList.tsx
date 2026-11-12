/** Earlier calculations: the expression on the left, '= result' on the right. */

import { ContextMenu } from '@astryxdesign/core/ContextMenu';
import { ScrollableArea } from '@astryxdesign/core/ScrollableArea';
import { useLayoutEffect, useRef, useState } from 'react';

import type { HistoryEntry } from '../shared/settings';

export const HISTORY_HEIGHT = 170;

export interface HistoryListProps {
  entries: readonly HistoryEntry[];
  onPick(entry: HistoryEntry): void;
  onInsert(text: string): void;
  onCopy(text: string): void;
  onClear(): void;
}

function tooltip(entry: HistoryEntry): string {
  return `${entry.expr}\n= ${entry.result}${entry.alt ? `\n${entry.alt}` : ''}`;
}

export function HistoryList({ entries, onPick, onInsert, onCopy, onClear }: HistoryListProps) {
  const endRef = useRef<HTMLDivElement>(null);
  // The row the context menu was opened on, or null for the empty area below the rows.
  const [menuEntry, setMenuEntry] = useState<HistoryEntry | null>(null);

  // Keep the newest calculation in view, like the original's scrollToBottom().
  useLayoutEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [entries]);

  const items = [
    ...(menuEntry
      ? [
          { label: 'Insert result', onClick: () => onInsert(menuEntry.result) },
          { label: 'Copy result', onClick: () => onCopy(menuEntry.result) },
          { label: 'Copy expression', onClick: () => onCopy(menuEntry.expr) },
          { type: 'divider' as const },
        ]
      : []),
    { label: 'Clear history (Ctrl+L)', onClick: onClear, isDisabled: entries.length === 0 },
  ];

  return (
    <div
      className="qc-history"
      style={{ height: HISTORY_HEIGHT }}
      onContextMenuCapture={(e) => {
        const row = (e.target as HTMLElement).closest<HTMLElement>('[data-index]');
        setMenuEntry(row ? (entries[Number(row.dataset.index)] ?? null) : null);
      }}
      // History rows never take focus; typing stays in the input line.
      onMouseDown={(e) => e.preventDefault()}
    >
      <ContextMenu items={items} label="History" menuWidth="200px" size="sm">
        <ScrollableArea label="History" height={HISTORY_HEIGHT - 2} overscroll="contain">
          <div className="qc-history-rows">
            {entries.map((entry, index) => (
              <div
                // Entries are append-only, so the index is a stable key.
                key={index}
                className="qc-history-row"
                data-index={index}
                title={tooltip(entry)}
                onClick={() => onPick(entry)}
              >
                <span className="qc-history-expr">{entry.expr}</span>
                <span className="qc-history-result">
                  <bdi>= {entry.result}</bdi>
                </span>
              </div>
            ))}
            <div ref={endRef} />
          </div>
        </ScrollableArea>
      </ContextMenu>
    </div>
  );
}
