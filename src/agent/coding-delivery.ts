/** Pure, bounded delivery primitives. No filesystem, network, shell or model access. */
export function recordsToCsv(rows: unknown, columns: readonly string[]): string {
  if (!Array.isArray(rows) || rows.length > 500 || columns.length === 0 || columns.length > 50 ||
      new Set(columns).size !== columns.length || columns.some(c => !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(c))) throw Error('CSV_SCHEMA');
  const cell = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (!['string', 'number', 'boolean'].includes(typeof value) ||
        (typeof value === 'number' && !Number.isFinite(value))) throw Error('CSV_AMBIGUOUS_VALUE');
    let text = String(value);
    if (text.length > 10000) throw Error('CSV_SIZE');
    // Spreadsheet-safe export; identifiers are never parsed as numbers.
    if (typeof value === 'string' && /^[\s]*[=+@-]/u.test(text)) text = "'" + text;
    return /[",\r\n]/u.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  };
  return [columns.join(','), ...rows.map(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row) ||
        Object.keys(row).some(k => !columns.includes(k))) throw Error('CSV_UNMAPPED_FIELD');
    return columns.map(key => cell(Object.hasOwn(row, key) ? (row as Record<string, unknown>)[key] : null)).join(',');
  })].join('\r\n');
}

export interface ApiSpecification {
  paths: Record<string, Record<string, { responses?: Record<string, unknown> }>>;
}
export function documentApi(spec: ApiSpecification): string {
  if (!spec || !spec.paths || typeof spec.paths !== 'object' || Array.isArray(spec.paths)) throw Error('API_SPEC');
  const lines: string[] = [];
  for (const [route, operations] of Object.entries(spec.paths).sort()) {
    if (!/^\/[A-Za-z0-9_/{}/.-]*$/.test(route) || !operations || typeof operations !== 'object') throw Error('API_PATH');
    for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']) {
      if (!Object.hasOwn(operations, method)) continue;
      const operation = operations[method];
      const responses = operation?.responses;
      const codes = responses && typeof responses === 'object' && !Array.isArray(responses) ? Object.keys(responses).sort() : [];
      if (codes.some(code => !/^(?:[1-5][0-9]{2}|default)$/.test(code))) throw Error('API_RESPONSE');
      lines.push(`${method.toUpperCase()} ${route} | responses: ${codes.join(', ') || 'unknown'}`);
    }
  }
  if (lines.length > 500) throw Error('API_SIZE');
  return lines.join('\n');
}

export interface MockPage { url: string; status: number; contentType: string; body: string }
export function processMockPages(pages: readonly MockPage[], allowedOrigin: string): string[] {
  if (pages.length > 20) throw Error('WEB_SIZE');
  const origin = new URL(allowedOrigin);
  if (origin.protocol !== 'https:' || origin.origin !== allowedOrigin || origin.username || origin.password) throw Error('WEB_ORIGIN');
  const titles = new Map<string, string>();
  for (const page of pages) {
    const url = new URL(page.url);
    if (url.origin !== allowedOrigin || url.username || url.password || url.hash ||
        page.status !== 200 || page.contentType !== 'text/html' || page.body.length > 100000) throw Error('WEB_INPUT');
    // Deliberately supports a narrow fixture contract, not a general HTML parser.
    const matches = [...page.body.matchAll(/<title>([^<>]*)<\/title>/g)];
    if (matches.length !== 1) throw Error('WEB_TITLE');
    const title = matches[0][1].replace(/&amp;/g, '&').trim();
    if (!title || /[<>]|&(?:#|[A-Za-z])/u.test(title) || [...title].some(c => c.charCodeAt(0) < 32)) throw Error('WEB_TITLE');
    const previous = titles.get(url.href);
    if (previous !== undefined && previous !== title) throw Error('WEB_CONFLICT');
    titles.set(url.href, title);
  }
  return [...titles.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([url, title]) => `${url}\t${title}`);
}
