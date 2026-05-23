import { useEffect, useRef, useState } from 'react';
import type { ContextUsed } from '../../api/types';

const BRAIN_LABELS: Record<string, string> = {
  company_name: 'your company name',
  company_description: 'what your company does',
  industry: 'your industry',
  target_audience: 'your target audience',
  brand_voice: 'your brand voice',
};

/**
 * Tier 3 bonus — Message DNA tooltip.
 * Shows what informed an assistant message: brain fields, prior message
 * count, tools called, artifacts referenced.
 */
export default function ContextDNAPopover({ context }: { context?: ContextUsed | null }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!context) return null;
  const brain = context.brain_fields || [];
  const tools = context.tools_called || [];
  const arts = context.artifacts_referenced || [];

  return (
    <span ref={wrapRef} style={{ position: 'relative' }}>
      <span className="dna-icon" onClick={() => setOpen((o) => !o)} title="What informed this response?">
        ⓘ DNA
      </span>
      {open && (
        <div className="dna-popover" style={{ bottom: '120%', left: 0 }}>
          <h4>Message DNA</h4>
          <div className="dna-section">
            <strong>Brain context</strong>
            {brain.length === 0 ? (
              <div style={{ color: 'var(--text-dim)' }}>none</div>
            ) : (
              <ul>{brain.map((b) => <li key={b}>{BRAIN_LABELS[b] || b}</li>)}</ul>
            )}
          </div>
          <div className="dna-section">
            <strong>Prior messages used:</strong> {context.prior_messages ?? 0}
          </div>
          <div className="dna-section">
            <strong>Tools called</strong>
            {tools.length === 0 ? (
              <div style={{ color: 'var(--text-dim)' }}>none</div>
            ) : (
              <ul>
                {tools.map((t, i) => (
                  <li key={i}>
                    <code>{t.name}</code>
                    {t.server_side && <em style={{ color: 'var(--text-dim)' }}> (server)</em>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {arts.length > 0 && (
            <div className="dna-section">
              <strong>Artifacts referenced:</strong> {arts.join(', ')}
            </div>
          )}
        </div>
      )}
    </span>
  );
}
