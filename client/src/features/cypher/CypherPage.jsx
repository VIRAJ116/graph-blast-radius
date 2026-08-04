import React, { useState } from 'react';
import { api } from '../../api/client.js';
import { useApi } from '../../hooks/useApi.js';
import { Card, Badge, Button, ErrorState, LoadingState } from '../../components/ui/index.jsx';

/**
 * The queries screen.
 *
 * Shows every Cypher statement the application runs, taken from the same
 * modules the API executes — so what is displayed here and what is sent to the
 * database cannot drift apart.
 *
 * It is deliberately not a console. A free-text Cypher box against a live demo
 * instance is a write and delete surface, and it would demonstrate nothing
 * about this codebase that these queries do not.
 */
export function CypherPage() {
  const { data, loading, error, refetch } = useApi(({ signal }) => api.queries({ signal }), []);
  const [openId, setOpenId] = useState('isolation-impact');

  if (loading) {
    return (
      <Card>
        <LoadingState message="Loading query catalogue…" />
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <ErrorState error={error} onRetry={refetch} />
      </Card>
    );
  }

  const queries = data?.queries ?? [];

  return (
    <div className="space-y-5">
      <Card title="Parameterisation" subtitle="How user input reaches the database.">
        <p className="text-sm leading-relaxed text-slate-300">
          Every value that originates with the user — device identifiers, result limits, excluded
          nodes, role filters — is sent as a driver query parameter. No query in this application is
          built by concatenating strings.
        </p>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          One constraint is worth stating plainly, because it looks like an exception. Cypher does
          not accept a parameter as the bound of a variable-length pattern:{' '}
          <code className="rounded bg-surface-raised px-1 py-0.5 font-mono text-[11px] text-slate-300">
            -[:LINKED_TO*..$maxHops]-
          </code>{' '}
          is a syntax error rather than a runtime failure. The usual workaround is to interpolate
          the number, which quietly reintroduces string-built Cypher. Instead the eight legal depths
          are compiled into a frozen lookup table at startup, and a request selects an entry by
          integer — a depth outside the list is rejected, not coerced.
        </p>
      </Card>

      {queries.map((query) => (
        <QueryCard
          key={query.id}
          query={query}
          isOpen={openId === query.id}
          onToggle={() => setOpenId(openId === query.id ? null : query.id)}
        />
      ))}
    </div>
  );
}

function QueryCard({ query, isOpen, onToggle }) {
  return (
    <Card
      title={query.title}
      subtitle={query.endpoint}
      actions={
        <div className="flex items-center gap-2">
          {query.headline && (
            <Badge className="bg-sky-500/15 text-sky-300 ring-sky-500/30">Headline query</Badge>
          )}
          <Badge className="bg-slate-500/15 text-slate-400 ring-slate-500/25">{query.hops}</Badge>
          <Button size="sm" variant="ghost" onClick={onToggle}>
            {isOpen ? 'Hide' : 'Show'}
          </Button>
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-slate-300">{query.whyGraph}</p>

      {isOpen && (
        <div className="mt-4 space-y-4">
          <CodeBlock label="Cypher" code={query.cypher} />

          {query.followUp && <CodeBlock label="Follow-up query" code={query.followUp} />}

          <CodeBlock
            label="Example parameters"
            code={JSON.stringify(query.exampleParams, null, 2)}
            language="json"
          />
        </div>
      )}
    </Card>
  );
}

function CodeBlock({ label, code, language = 'cypher' }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access is denied in some embedded browsers. The code is
      // selectable either way, so this is not worth an error message.
    }
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </span>
        <button
          type="button"
          onClick={copy}
          className="text-[11px] text-slate-500 transition-colors hover:text-slate-300"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {/* Wide queries scroll inside this container so the page never does. */}
      <pre
        className="scroll-x rounded-lg border border-surface-border bg-surface-base/70 p-4
          font-mono text-[12px] leading-relaxed text-slate-300"
      >
        <code>{language === 'json' ? code : highlightCypher(code)}</code>
      </pre>
    </div>
  );
}

/**
 * Minimal Cypher highlighting.
 *
 * A syntax-highlighting library would be ~40 KB to colour seven queries. This
 * splits on the three things worth distinguishing — keywords, $parameters and
 * comments — and leaves everything else alone.
 */
const CYPHER_KEYWORDS = new Set([
  'MATCH', 'OPTIONAL', 'WHERE', 'RETURN', 'WITH', 'UNWIND', 'ORDER', 'BY', 'LIMIT', 'SKIP',
  'AND', 'OR', 'NOT', 'IN', 'AS', 'DISTINCT', 'EXISTS', 'NONE', 'ALL', 'ANY', 'CASE', 'WHEN',
  'THEN', 'ELSE', 'END', 'MERGE', 'SET', 'CREATE', 'DELETE', 'DETACH', 'IS', 'NULL', 'DESC', 'ASC',
  'count', 'collect', 'size', 'reduce', 'nodes', 'relationships', 'length', 'toLower', 'toInteger',
  'allShortestPaths', 'shortestPath', 'labels', 'type', 'sum',
]);

function highlightCypher(code) {
  return code.split('\n').map((line, lineIndex) => {
    const commentIndex = line.indexOf('//');
    const codePart = commentIndex >= 0 ? line.slice(0, commentIndex) : line;
    const commentPart = commentIndex >= 0 ? line.slice(commentIndex) : '';

    const tokens = codePart.split(/(\s+|[(){}[\],:.<>=|-])/).map((token, tokenIndex) => {
      if (token.startsWith('$')) {
        return (
          <span key={tokenIndex} className="text-amber-300">
            {token}
          </span>
        );
      }
      if (CYPHER_KEYWORDS.has(token)) {
        return (
          <span key={tokenIndex} className="font-medium text-sky-300">
            {token}
          </span>
        );
      }
      return token;
    });

    return (
      <span key={lineIndex}>
        {tokens}
        {commentPart && <span className="italic text-slate-600">{commentPart}</span>}
        {'\n'}
      </span>
    );
  });
}
