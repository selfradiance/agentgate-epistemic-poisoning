import { describe, it, expect, beforeEach } from 'vitest';
import { computeHash, KBFragmentSchema } from '../src/kb/types.js';
import { DocumentStore } from '../src/kb/store.js';
import { formatKB } from '../src/kb/formatter.js';
import { SHARED_DOCUMENTS, APPLICANT_SCENARIOS, getKBForScenario } from '../src/kb/seed-data.js';

// ============================================================
// Hash utility
// ============================================================

describe('computeHash', () => {
  it('produces consistent SHA-256 hex digests', () => {
    const hash1 = computeHash('hello');
    const hash2 = computeHash('hello');
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 = 64 hex chars
  });

  it('produces different hashes for different inputs', () => {
    expect(computeHash('hello')).not.toBe(computeHash('world'));
  });
});

// ============================================================
// DocumentStore
// ============================================================

describe('DocumentStore', () => {
  let store: DocumentStore;

  const testFragments = [
    { doc_id: 'doc_a', fragment_id: 'doc_a_f1', text: 'First fragment' },
    { doc_id: 'doc_a', fragment_id: 'doc_a_f2', text: 'Second fragment' },
    { doc_id: 'doc_b', fragment_id: 'doc_b_f1', text: 'Another doc' },
  ];

  beforeEach(() => {
    store = new DocumentStore();
    store.load(testFragments);
  });

  it('loads fragments with correct count', () => {
    expect(store.size).toBe(3);
  });

  it('loads fragments with computed hashes', () => {
    const f = store.getFragment('doc_a_f1');
    expect(f).toBeDefined();
    expect(f!.hash).toBe(computeHash('First fragment'));
    expect(f!.original_text).toBe('First fragment');
    expect(f!.current_text).toBe('First fragment');
    expect(f!.is_poisoned).toBe(false);
  });

  it('returns undefined for unknown fragment ID', () => {
    expect(store.getFragment('nonexistent')).toBeUndefined();
  });

  it('filters fragments by doc_id', () => {
    const docA = store.getFragmentsByDoc('doc_a');
    expect(docA).toHaveLength(2);
    expect(docA.every((f) => f.doc_id === 'doc_a')).toBe(true);
  });

  it('validates fragments against KBFragmentSchema', () => {
    for (const f of store.getAllFragments()) {
      const result = KBFragmentSchema.safeParse(f);
      expect(result.success).toBe(true);
    }
  });

  describe('applyMutation', () => {
    it('marks fragment as poisoned with correct metadata', () => {
      store.applyMutation('doc_a_f1', 'Poisoned text', 'numerical_drift');
      const f = store.getFragment('doc_a_f1')!;
      expect(f.current_text).toBe('Poisoned text');
      expect(f.original_text).toBe('First fragment');
      expect(f.is_poisoned).toBe(true);
      expect(f.mutation_class).toBe('numerical_drift');
      expect(f.hash).toBe(computeHash('Poisoned text'));
    });

    it('throws for unknown fragment ID', () => {
      expect(() => store.applyMutation('bad_id', 'text', 'drift')).toThrow('Fragment not found');
    });
  });

  describe('snapshot and restore', () => {
    it('creates an independent snapshot', () => {
      const snap = store.snapshot();
      store.applyMutation('doc_a_f1', 'Changed', 'injection');

      // Snapshot should be unaffected
      const snapFragment = snap.fragments.find((f) => f.fragment_id === 'doc_a_f1')!;
      expect(snapFragment.current_text).toBe('First fragment');
      expect(snapFragment.is_poisoned).toBe(false);

      // Store should be changed
      expect(store.getFragment('doc_a_f1')!.current_text).toBe('Changed');
    });

    it('restores to a previous snapshot', () => {
      const snap = store.snapshot();
      store.applyMutation('doc_a_f1', 'Changed', 'injection');
      store.applyMutation('doc_b_f1', 'Also changed', 'omission');

      store.restore(snap);

      expect(store.getFragment('doc_a_f1')!.current_text).toBe('First fragment');
      expect(store.getFragment('doc_a_f1')!.is_poisoned).toBe(false);
      expect(store.getFragment('doc_b_f1')!.current_text).toBe('Another doc');
    });
  });

  describe('diff', () => {
    it('returns empty array when no mutations applied', () => {
      expect(store.diff()).toEqual([]);
    });

    it('returns all poisoned fragments', () => {
      store.applyMutation('doc_a_f1', 'Changed 1', 'drift');
      store.applyMutation('doc_b_f1', 'Changed 2', 'omission');

      const diffs = store.diff();
      expect(diffs).toHaveLength(2);
      expect(diffs[0].fragment_id).toBe('doc_a_f1');
      expect(diffs[0].mutation_class).toBe('drift');
      expect(diffs[1].fragment_id).toBe('doc_b_f1');
    });
  });

  describe('reset', () => {
    it('restores all fragments to original state', () => {
      store.applyMutation('doc_a_f1', 'Changed', 'injection');
      store.applyMutation('doc_b_f1', 'Also changed', 'omission');

      store.reset();

      for (const f of store.getAllFragments()) {
        expect(f.current_text).toBe(f.original_text);
        expect(f.is_poisoned).toBe(false);
        expect(f.mutation_class).toBeUndefined();
        expect(f.hash).toBe(computeHash(f.original_text));
      }
    });
  });
});

// ============================================================
// KB Formatter
// ============================================================

describe('formatKB', () => {
  it('groups fragments by doc_id with rigid headers', () => {
    const store = new DocumentStore();
    store.load([
      { doc_id: 'doc_a', fragment_id: 'doc_a_f1', text: 'Hello' },
      { doc_id: 'doc_a', fragment_id: 'doc_a_f2', text: 'World' },
      { doc_id: 'doc_b', fragment_id: 'doc_b_f1', text: 'Other' },
    ]);

    const output = formatKB(store.getAllFragments());
    expect(output).toContain('[FILE: doc_a.md]');
    expect(output).toContain('[FRAGMENT: doc_a_f1]');
    expect(output).toContain('[FRAGMENT: doc_a_f2]');
    expect(output).toContain('[FILE: doc_b.md]');
    expect(output).toContain('[FRAGMENT: doc_b_f1]');
    expect(output).toContain('---'); // separator between docs
  });

  it('uses current_text, not original_text', () => {
    const store = new DocumentStore();
    store.load([{ doc_id: 'doc', fragment_id: 'doc_f1', text: 'Original' }]);
    store.applyMutation('doc_f1', 'Poisoned', 'drift');

    const output = formatKB(store.getAllFragments());
    expect(output).toContain('Poisoned');
    expect(output).not.toContain('Original');
  });
});

// ============================================================
// Seed Data
// ============================================================

describe('Seed Data', () => {
  it('has at least 3 shared documents', () => {
    const docIds = new Set(SHARED_DOCUMENTS.map((f) => f.doc_id));
    expect(docIds.size).toBeGreaterThanOrEqual(3);
  });

  it('has at least 3 applicant scenarios', () => {
    expect(APPLICANT_SCENARIOS).toHaveLength(3);
  });

  it('each scenario has unique ID and fragments', () => {
    const ids = new Set(APPLICANT_SCENARIOS.map((s) => s.id));
    expect(ids.size).toBe(APPLICANT_SCENARIOS.length);

    for (const s of APPLICANT_SCENARIOS) {
      expect(s.fragments.length).toBeGreaterThan(0);
      expect(s.data.applicant_id).toBe(s.id);
    }
  });

  it('all fragment IDs are globally unique', () => {
    const allFragments = [
      ...SHARED_DOCUMENTS,
      ...APPLICANT_SCENARIOS.flatMap((s) => s.fragments),
    ];
    const ids = allFragments.map((f) => f.fragment_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('getKBForScenario combines shared docs + applicant', () => {
    const scenario = APPLICANT_SCENARIOS[0];
    const kb = getKBForScenario(scenario);
    expect(kb.length).toBe(SHARED_DOCUMENTS.length + scenario.fragments.length);
  });

  it('includes at least one structured artifact (threshold table)', () => {
    const thresholdFrags = SHARED_DOCUMENTS.filter((f) => f.doc_id === 'risk_thresholds');
    expect(thresholdFrags.length).toBeGreaterThan(0);
    // Verify it contains table-like content
    const text = thresholdFrags.map((f) => f.text).join('\n');
    expect(text).toContain('|');
  });

  it('loads into DocumentStore without errors', () => {
    const store = new DocumentStore();
    for (const scenario of APPLICANT_SCENARIOS) {
      store.load(getKBForScenario(scenario));
      expect(store.size).toBeGreaterThan(0);
    }
  });
});
