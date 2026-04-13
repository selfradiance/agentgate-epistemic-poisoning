import { KBFragment } from './types.js';

/**
 * Format KB fragments into the rigid injection format with file headers
 * and fragment markers that the target agent reads.
 *
 * Output format:
 * [FILE: doc_id.md]
 *
 * [FRAGMENT: fragment_id]
 * ...text...
 *
 * ---
 *
 * [FILE: next_doc.md]
 * ...
 */
export function formatKB(fragments: KBFragment[]): string {
  const byDoc = new Map<string, KBFragment[]>();
  for (const f of fragments) {
    const list = byDoc.get(f.doc_id) || [];
    list.push(f);
    byDoc.set(f.doc_id, list);
  }

  const sections: string[] = [];
  for (const [docId, frags] of byDoc) {
    const parts = [`[FILE: ${docId}.md]\n`];
    for (const f of frags) {
      parts.push(`[FRAGMENT: ${f.fragment_id}]\n${f.current_text}\n`);
    }
    sections.push(parts.join('\n'));
  }
  return sections.join('\n---\n\n');
}
