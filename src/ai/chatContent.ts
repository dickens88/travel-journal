import type { ChatRow } from '@/db/types';

// Helpers to read stored API content blocks for display
export type StoredBlock = { type: string; [k: string]: any };

export function blocksOf(contentJson: string): StoredBlock[] {
  try {
    const v = JSON.parse(contentJson);
    return typeof v === 'string' ? [{ type: 'text', text: v }] : v;
  } catch {
    return [];
  }
}

export function textOf(blocks: StoredBlock[]) {
  return blocks
    .filter((b) => b.type === 'text')
    .map((b) => b.text as string)
    .join('')
    .trim();
}

export function photoIdsOf(blocks: StoredBlock[]) {
  return blocks.filter((b) => b.type === 'trip_photo').map((b) => b.photo_id as string);
}

export function usedWebSearch(blocks: StoredBlock[]) {
  return blocks.some((b) => b.type === 'server_tool_use' && b.name === 'web_search');
}

export function savedNoteTexts(blocks: StoredBlock[]) {
  return blocks.filter((b) => b.type === 'tool_use' && b.name === 'save_note').map((b) => String(b.input?.text ?? ''));
}

// Tool-result-only user turns are plumbing, not something the user typed
export function isToolResultTurn(blocks: StoredBlock[]) {
  return blocks.length > 0 && blocks.every((b) => b.type === 'tool_result');
}

// A user row the person actually typed (not tool-result plumbing)
export function isUserTurn(row: ChatRow) {
  return row.role === 'user' && !isToolResultTurn(blocksOf(row.content_json));
}
