import { memo } from 'react';
import { Linking, Platform, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';

import { Colors } from '@/constants/theme';
import { parseMarkdown, splitSettled, type Span } from '@/utils/markdown';

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

function Spans({ spans }: { spans: Span[] }) {
  return spans.map((s, i) => (
    <Text
      key={i}
      onPress={s.href ? () => Linking.openURL(s.href!).catch(() => {}) : undefined}
      style={[
        s.bold && styles.bold,
        s.italic && styles.italic,
        s.strike && styles.strike,
        s.code && styles.inlineCode,
        s.href && styles.link,
      ]}>
      {s.text}
    </Text>
  ));
}

type Props = { text: string; style?: StyleProp<TextStyle> };

// Renders a chat reply's markdown; `style` is the base text style (size, line height, colour).
// The settled part only changes when a block completes, so a streaming reply re-parses just its tail.
export const Markdown = memo(function Markdown({ text, style }: Props) {
  const [settled, tail] = splitSettled(text);
  return (
    <View style={styles.root}>
      <Blocks text={settled} style={style} />
      <Blocks text={tail} style={style} />
    </View>
  );
});

const Blocks = memo(function Blocks({ text, style }: Props) {
  return (
    <>
      {parseMarkdown(text).map((b, i) => {
        switch (b.type) {
          case 'heading':
            return (
              <Text key={i} style={[style, styles.heading, b.level <= 2 && { fontSize: 17 }]}>
                <Spans spans={b.spans} />
              </Text>
            );
          case 'paragraph':
            return (
              <Text key={i} style={style}>
                <Spans spans={b.spans} />
              </Text>
            );
          case 'item':
            return (
              <View key={i} style={[styles.item, { paddingLeft: b.depth * 16 }]}>
                <Text style={[style, styles.marker, b.ordered && styles.number]}>{b.marker}</Text>
                <Text style={[style, { flex: 1 }]}>
                  <Spans spans={b.spans} />
                </Text>
              </View>
            );
          case 'quote':
            return (
              <View key={i} style={styles.quote}>
                <Text style={[style, { color: Colors.muted }]}>
                  <Spans spans={b.spans} />
                </Text>
              </View>
            );
          case 'code':
            return (
              <View key={i} style={styles.codeBlock}>
                <Text style={styles.codeText}>{b.text}</Text>
              </View>
            );
          case 'hr':
            return <View key={i} style={styles.hr} />;
          case 'table':
            return (
              <View key={i} style={styles.table}>
                {[b.header, ...b.rows].map((row, r) => (
                  <View key={r} style={[styles.row, r > 0 && styles.rowLine, r === 0 && styles.headRow]}>
                    {b.header.map((_, c) => (
                      <Text key={c} style={[style, styles.cell, r === 0 && styles.bold]}>
                        <Spans spans={row[c] ?? []} />
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            );
        }
      })}
    </>
  );
});

const styles = StyleSheet.create({
  root: { gap: 8 },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  strike: { textDecorationLine: 'line-through' },
  link: { color: Colors.teal, textDecorationLine: 'underline' },
  inlineCode: { fontFamily: MONO, fontSize: 13, backgroundColor: Colors.chip },
  heading: { fontWeight: '700' },
  item: { flexDirection: 'row', gap: 6 },
  marker: { color: Colors.accent, fontWeight: '700' },
  number: { minWidth: 18 },
  quote: { borderLeftWidth: 3, borderLeftColor: Colors.popSoft, paddingLeft: 10 },
  codeBlock: { padding: 10, borderRadius: 10, backgroundColor: Colors.chip },
  codeText: { fontFamily: MONO, fontSize: 13, lineHeight: 19, color: Colors.inkSoft },
  hr: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.line, marginVertical: 2 },
  table: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line, overflow: 'hidden' },
  row: { flexDirection: 'row' },
  headRow: { backgroundColor: Colors.chip },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line },
  cell: { flex: 1, paddingHorizontal: 8, paddingVertical: 6, fontSize: 13, lineHeight: 19 },
});
