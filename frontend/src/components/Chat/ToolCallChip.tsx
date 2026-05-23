import type { ToolCall } from '../../api/types';

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

export default function ToolCallChip({ call }: { call: ToolCall }) {
  const status = call.status;
  const label = PRETTY_NAMES[call.tool_name] || call.tool_name;
  const detail = summarizeInput(call.tool_name, call.input);
  return (
    <div className={`tool-chip ${status}`} title={JSON.stringify(call.output ?? call.input ?? {}, null, 2)}>
      <span className="dot" />
      <span className="label">{label}</span>
      {detail && <span>· {detail}</span>}
      {status === 'running' && <span style={{ marginLeft: 4 }}>…</span>}
    </div>
  );
}
