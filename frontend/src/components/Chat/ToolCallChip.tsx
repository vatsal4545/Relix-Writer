import { useState } from 'react';
import type { ToolCall, WebSearchResult } from '../../api/types';

const PRETTY_NAMES: Record<string, string> = {
  create_content_idea: 'Creating blog idea',
  update_content_plan: 'Writing plan',
  execute_plan: 'Writing full blog post',
  find_trending_topics: 'Finding trending topics',
  web_search: 'Searching the web',
};

function summarizeInput(name: string, input?: Record<string, unknown>): string {
  if (!input) return '';
  if (name === 'create_content_idea') return String(input.title || '');
  if (name === 'find_trending_topics') return String(input.industry || '');
  if (name === 'web_search') return String((input as any).query || '');
  if (name === 'update_content_plan') return 'plan draft';
  if (name === 'execute_plan') return 'generating content…';
  return '';
}

function hostname(url?: string | null): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Renders the result list from Anthropic's web_search tool. */
function WebSearchDetails({ results }: { results: WebSearchResult[] }) {
  if (!results || results.length === 0) {
    return <div className="ws-results-empty">No results returned.</div>;
  }
  return (
    <ol className="ws-results-list">
      {results.map((r, i) => (
        <li key={i}>
          <a href={r.url || '#'} target="_blank" rel="noopener noreferrer">
            {r.title || r.url}
          </a>
          <div className="ws-result-meta">
            {hostname(r.url)}{r.page_age ? ` · ${r.page_age}` : ''}
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function ToolCallChip({ call }: { call: ToolCall }) {
  const [open, setOpen] = useState(false);
  const status = call.status;
  const label = PRETTY_NAMES[call.tool_name] || call.tool_name;
  const detail = summarizeInput(call.tool_name, call.input);

  const isWebSearch = call.tool_name === 'web_search';
  const results: WebSearchResult[] = isWebSearch && call.output?.results
    ? call.output.results
    : [];
  const count = isWebSearch ? (call.output?.result_count ?? results.length) : 0;
  const expandable = isWebSearch && status !== 'running';
  const query = String((call.input as any)?.query || '');

  return (
    <div className="tool-chip-wrap">
      <div
        className={`tool-chip ${status} ${expandable ? 'expandable' : ''}`}
        onClick={() => expandable && setOpen((o) => !o)}
        title={
          isWebSearch
            ? `${count} result${count === 1 ? '' : 's'} — click to expand`
            : JSON.stringify(call.output ?? call.input ?? {}, null, 2)
        }
      >
        <span className="dot" />
        <span className="label">{label}</span>
        {detail && <span className="detail">· {detail}</span>}
        {status === 'running' && isWebSearch && query && (
          <span className="ws-query-running">searching “{query}”…</span>
        )}
        {status === 'running' && !isWebSearch && <span style={{ marginLeft: 4 }}>…</span>}
        {isWebSearch && status === 'done' && (
          <span className="ws-count">
            {count} result{count === 1 ? '' : 's'} {open ? '▴' : '▾'}
          </span>
        )}
      </div>
      {isWebSearch && open && (
        <div className="ws-results-panel">
          {query && (
            <div className="ws-results-header">
              <strong>Query:</strong> <code>{query}</code>
            </div>
          )}
          <WebSearchDetails results={results} />
        </div>
      )}
    </div>
  );
}
