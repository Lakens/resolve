import React, { useEffect, useRef } from 'react';

export function HarperPopover({ match, anchorPos, onAccept, onDismiss }) {
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onDismiss();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onDismiss]);

  if (!match || !anchorPos) return null;

  const left = Math.min(anchorPos.x, window.innerWidth - 280);
  const top = anchorPos.y + 22;

  const categoryLabel = { spelling: 'Spelling', grammar: 'Grammar', style: 'Style' }[match.category] ?? 'Suggestion';
  const categoryClass = `lt-popover-badge lt-badge-${match.category}`;

  return (
    <div
      ref={ref}
      className="lt-popover"
      style={{ left, top }}
    >
      <div className="lt-popover-header">
        <span className={categoryClass}>{categoryLabel}</span>
        <button className="lt-popover-close" onClick={onDismiss} aria-label="Dismiss">x</button>
      </div>
      <p className="lt-popover-message">{match.message}</p>
      {match.replacements?.length > 0 && (
        <div className="lt-popover-suggestions">
          {match.replacements.slice(0, 5).map((replacement, index) => (
            <button
              key={`${replacement.value}-${index}`}
              className="lt-popover-suggestion"
              onClick={() => onAccept(replacement.value)}
            >
              {replacement.value || '(remove)'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
