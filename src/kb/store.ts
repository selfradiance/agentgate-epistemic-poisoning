import { KBFragment, RawFragment, computeHash } from './types.js';

export interface KBSnapshot {
  fragments: KBFragment[];
  timestamp: number;
}

export interface KBDiff {
  fragment_id: string;
  doc_id: string;
  original_text: string;
  current_text: string;
  mutation_class?: string;
}

export class DocumentStore {
  private fragments: Map<string, KBFragment> = new Map();

  load(rawFragments: RawFragment[]): void {
    this.fragments.clear();
    for (const f of rawFragments) {
      const hash = computeHash(f.text);
      this.fragments.set(f.fragment_id, {
        doc_id: f.doc_id,
        fragment_id: f.fragment_id,
        original_text: f.text,
        current_text: f.text,
        hash,
        is_poisoned: false,
      });
    }
  }

  getFragment(fragmentId: string): KBFragment | undefined {
    return this.fragments.get(fragmentId);
  }

  getAllFragments(): KBFragment[] {
    return Array.from(this.fragments.values());
  }

  getFragmentsByDoc(docId: string): KBFragment[] {
    return this.getAllFragments().filter((f) => f.doc_id === docId);
  }

  applyMutation(fragmentId: string, mutatedText: string, mutationClass: string): void {
    const fragment = this.fragments.get(fragmentId);
    if (!fragment) {
      throw new Error(`Fragment not found: ${fragmentId}`);
    }

    fragment.current_text = mutatedText;
    fragment.hash = computeHash(mutatedText);
    fragment.is_poisoned = true;
    fragment.mutation_class = mutationClass;
  }

  snapshot(): KBSnapshot {
    return {
      fragments: this.getAllFragments().map((f) => ({ ...f })),
      timestamp: Date.now(),
    };
  }

  restore(snapshot: KBSnapshot): void {
    this.fragments.clear();
    for (const f of snapshot.fragments) {
      this.fragments.set(f.fragment_id, { ...f });
    }
  }

  diff(): KBDiff[] {
    const diffs: KBDiff[] = [];
    for (const f of this.fragments.values()) {
      if (f.is_poisoned) {
        diffs.push({
          fragment_id: f.fragment_id,
          doc_id: f.doc_id,
          original_text: f.original_text,
          current_text: f.current_text,
          mutation_class: f.mutation_class,
        });
      }
    }
    return diffs;
  }

  reset(): void {
    for (const f of this.fragments.values()) {
      f.current_text = f.original_text;
      f.hash = computeHash(f.original_text);
      f.is_poisoned = false;
      f.mutation_class = undefined;
    }
  }

  get size(): number {
    return this.fragments.size;
  }
}
