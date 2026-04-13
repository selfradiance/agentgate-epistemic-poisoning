import { z } from 'zod';
import { createHash } from 'crypto';

export const KBFragmentSchema = z.object({
  doc_id: z.string(),
  fragment_id: z.string(),
  original_text: z.string(),
  current_text: z.string(),
  hash: z.string(),
  is_poisoned: z.boolean(),
  mutation_class: z.string().optional(),
});

export type KBFragment = z.infer<typeof KBFragmentSchema>;

export interface RawFragment {
  doc_id: string;
  fragment_id: string;
  text: string;
}

export function computeHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
