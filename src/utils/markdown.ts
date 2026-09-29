// Small markdown parser for chat replies. Tolerates half-streamed input: an unclosed marker stays literal text,
// an unclosed code fence renders as code so far.

export type Span = { text: string; bold?: boolean; italic?: boolean; strike?: boolean; code?: boolean; href?: string };
type Style = Omit<Span, 'text'>;

export type MdBlock =
  | { type: 'heading'; level: number; spans: Span[] }
  | { type: 'paragraph'; spans: Span[] }
  | { type: 'item'; ordered: boolean; marker: string; depth: number; spans: Span[] }
  | { type: 'quote'; spans: Span[] }
  | { type: 'code'; text: string }
  | { type: 'hr' }
  | { type: 'table'; header: Span[][]; rows: Span[][][] };

// Sticky: matched at the parse position via lastIndex
const LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/y;
const PAIRS = ['**', '__', '~~'] as const;

export function parseInline(src: string, style: Style = {}): Span[] {
  const out: Span[] = [];
  let buf = '';
  const flush = () => {
    if (buf) out.push({ text: buf, ...style });
    buf = '';
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '`') {
      const end = src.indexOf('`', i + 1);
      if (end > i + 1) {
        flush();
        out.push({ text: src.slice(i + 1, end), ...style, code: true });
        i = end + 1;
        continue;
      }
    }
    const pair = PAIRS.find((p) => src.startsWith(p, i));
    if (pair) {
      const end = src.indexOf(pair, i + 2);
      if (end > i + 2) {
        flush();
        out.push(...parseInline(src.slice(i + 2, end), { ...style, ...(pair === '~~' ? { strike: true } : { bold: true }) }));
        i = end + 2;
        continue;
      }
    }
    // Single * only: underscores show up inside words and file names
    if (c === '*' && src[i + 1] && src[i + 1] !== ' ' && src[i + 1] !== '*') {
      const end = src.indexOf('*', i + 1);
      if (end > i + 1 && src[end - 1] !== ' ') {
        flush();
        out.push(...parseInline(src.slice(i + 1, end), { ...style, italic: true }));
        i = end + 1;
        continue;
      }
    }
    if (c === '[') {
      LINK.lastIndex = i;
      const m = LINK.exec(src);
      if (m) {
        flush();
        out.push(...parseInline(m[1], { ...style, href: m[2] }));
        i += m[0].length;
        continue;
      }
    }
    buf += c;
    i++;
  }
  flush();
  return out;
}

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const HR = /^\s*([-*_])(\s*\1){2,}\s*$/;
const BULLET = /^(\s*)[-*+]\s+(.*)$/;
const ORDERED = /^(\s*)(\d{1,3})[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => parseInline(c.trim()));

type SpanBlock = Extract<MdBlock, { spans: Span[] }>;

export function parseMarkdown(src: string): MdBlock[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const out: MdBlock[] = [];
  // Raw text of the paragraph / quote / list item still being collected; widened so TS doesn't narrow it to null in the loop
  let open = null as { block: SpanBlock; raw: string } | null;
  const close = () => {
    if (open) open.block.spans = parseInline(open.raw);
    open = null;
  };
  const start = (block: SpanBlock, raw: string) => {
    close();
    out.push(block);
    open = { block, raw };
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = FENCE.exec(line);
    if (fence) {
      close();
      const body: string[] = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith(fence[1]); i++) body.push(lines[i]);
      out.push({ type: 'code', text: body.join('\n') });
      continue;
    }
    if (!line.trim()) {
      close();
      continue;
    }
    let m: RegExpExecArray | null;
    if ((m = HEADING.exec(line))) {
      close();
      out.push({ type: 'heading', level: m[1].length, spans: parseInline(m[2].replace(/\s+#+\s*$/, '')) });
    } else if (HR.test(line)) {
      close();
      out.push({ type: 'hr' });
    } else if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      close();
      const header = cells(line);
      const rows: Span[][][] = [];
      for (i += 2; i < lines.length && lines[i].includes('|') && lines[i].trim(); i++) rows.push(cells(lines[i]));
      i--;
      out.push({ type: 'table', header, rows });
    } else if ((m = BULLET.exec(line))) {
      start({ type: 'item', ordered: false, marker: '•', depth: Math.min(3, Math.floor(m[1].length / 2)), spans: [] }, m[2]);
    } else if ((m = ORDERED.exec(line))) {
      start({ type: 'item', ordered: true, marker: `${m[2]}.`, depth: Math.min(3, Math.floor(m[1].length / 2)), spans: [] }, m[3]);
    } else if ((m = QUOTE.exec(line))) {
      if (open?.block.type === 'quote') open.raw += `\n${m[1]}`;
      else start({ type: 'quote', spans: [] }, m[1]);
    } else {
      // Soft line breaks stay: chat replies use them deliberately
      if (open && open.block.type !== 'quote') open.raw += `\n${line.trim()}`;
      else start({ type: 'paragraph', spans: [] }, line.trim());
    }
  }
  close();
  return out;
}

// Splits at the last blank line outside a code fence. Everything before it parses the same however the text goes on,
// so a streaming reply only needs its tail re-parsed as it grows.
export function splitSettled(src: string): [string, string] {
  let cut = 0;
  let fence: string | null = null;
  let pos = 0;
  for (const line of src.split('\n')) {
    if (fence) {
      if (line.trim().startsWith(fence)) fence = null;
    } else {
      const m = FENCE.exec(line);
      if (m) fence = m[1];
      else if (!line.trim()) cut = pos;
    }
    pos += line.length + 1;
  }
  return [src.slice(0, cut), src.slice(cut)];
}

const plain = (spans: Span[]) => spans.map((s) => s.text).join('');

// Text for speech and one-line previews, without markdown symbols
export function stripMarkdown(src: string) {
  return parseMarkdown(src)
    .map((b) => {
      switch (b.type) {
        case 'code':
          return b.text;
        case 'hr':
          return '';
        case 'table':
          return [b.header, ...b.rows].map((r) => r.map(plain).join('，')).join('\n');
        default:
          return plain(b.spans);
      }
    })
    .filter(Boolean)
    .join('\n');
}
