import { describe, expect, it } from '@jest/globals';

import { parseInline, parseMarkdown, splitSettled, stripMarkdown } from '@/utils/markdown';

describe('markdown inline', () => {
  it('parses bold, italic, code, strike and links', () => {
    expect(parseInline('去**伏见稻荷**看*千本鸟居*')).toEqual([
      { text: '去' },
      { text: '伏见稻荷', bold: true },
      { text: '看' },
      { text: '千本鸟居', italic: true },
    ]);
    expect(parseInline('`JR` ~~关门~~ [官网](https://x.jp)')).toEqual([
      { text: 'JR', code: true },
      { text: ' ' },
      { text: '关门', strike: true },
      { text: ' ' },
      { text: '官网', href: 'https://x.jp' },
    ]);
    expect(parseInline('**[链接](u)**')).toEqual([{ text: '链接', bold: true, href: 'u' }]);
  });

  it('keeps unclosed markers literal while streaming', () => {
    expect(parseInline('推荐 **清水')).toEqual([{ text: '推荐 **清水' }]);
    expect(parseInline('3 * 4 = 12')).toEqual([{ text: '3 * 4 = 12' }]);
    expect(parseInline('file_name_here')).toEqual([{ text: 'file_name_here' }]);
  });
});

describe('markdown blocks', () => {
  it('parses headings, lists, quotes and rules', () => {
    const b = parseMarkdown('## 路线\n1. 清水寺\n2. **二年坂**\n  - 小吃\n> 提示\n---\n好好玩');
    expect(b.map((x) => x.type)).toEqual(['heading', 'item', 'item', 'item', 'quote', 'hr', 'paragraph']);
    expect(b[1]).toMatchObject({ ordered: true, marker: '1.', depth: 0 });
    expect(b[3]).toMatchObject({ ordered: false, marker: '•', depth: 1 });
  });

  it('keeps soft line breaks inside a paragraph', () => {
    expect(parseMarkdown('第一行\n第二行\n\n新段落')).toEqual([
      { type: 'paragraph', spans: [{ text: '第一行\n第二行' }] },
      { type: 'paragraph', spans: [{ text: '新段落' }] },
    ]);
  });

  it('parses tables and unclosed code fences', () => {
    const [t] = parseMarkdown('| 景点 | 门票 |\n|---|:-:|\n| 金阁寺 | 500 円 |');
    expect(t).toMatchObject({ type: 'table', header: [[{ text: '景点' }], [{ text: '门票' }]], rows: [[[{ text: '金阁寺' }], [{ text: '500 円' }]]] });
    expect(parseMarkdown('```\nlet a')).toEqual([{ type: 'code', text: 'let a' }]);
  });

  it('splits streaming text at the last blank line outside a code fence', () => {
    expect(splitSettled('甲\n\n乙\n丙')).toEqual(['甲\n', '\n乙\n丙']);
    expect(splitSettled('甲\n\n```\na\n\nb')).toEqual(['甲\n', '\n```\na\n\nb']);
    expect(splitSettled('只有一段')).toEqual(['', '只有一段']);
  });

  it('strips to plain text for speech', () => {
    expect(stripMarkdown('## 晚饭\n- **汤豆腐** 很*嫩*\n- 抹茶')).toBe('晚饭\n汤豆腐 很嫩\n抹茶');
  });
});
