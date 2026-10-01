// Conformance to the specification in spec/ (a copy of o1-labs/mina-sdk-spec
// at the tag in spec/VERSION): the query strings of src/queries.ts and
// src/itn/queries.ts are exactly the documents of spec/operations.graphql and
// spec/itn-operations.graphql, up to white space, and every document has one.
// mina-sdk-spec's CI validates the documents against the daemon's schemas.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALL_DOCUMENTS } from '../src/queries.js';
import { ALL_ITN_DOCUMENTS } from '../src/itn/queries.js';

function tokenize(doc: string): string[] {
  return doc.replace(/#[^\n]*/g, '').match(/[A-Za-z0-9_$]+|[(){}:!,[\]]/g) ?? [];
}

/** The operations of a document, by name, as tokens. */
function operations(doc: string): Map<string, string[]> {
  const toks = tokenize(doc);
  const ops = new Map<string, string[]>();
  let i = 0;
  while (i < toks.length) {
    const name = toks[i + 1] as string;
    const start = i;
    let depth = 0;
    let seenBody = false;
    for (;;) {
      if (toks[i] === '{') {
        depth++;
        seenBody = true;
      } else if (toks[i] === '}') {
        depth--;
      }
      i++;
      if (seenBody && depth === 0) break;
    }
    if (ops.has(name)) throw new Error(`operation ${name} twice`);
    ops.set(name, toks.slice(start, i));
  }
  return ops;
}

function expectDocumentsAreTheSpec(specFile: string, documents: string[]): void {
  const spec = operations(readFileSync(new URL(`../${specFile}`, import.meta.url), 'utf8'));
  const covered: string[] = [];
  for (const doc of documents) {
    const ops = operations(doc);
    expect(ops.size, `one named operation per query string:\n${doc}`).toBe(1);
    const [[name, toks]] = [...ops];
    expect(spec.has(name), `${name} is not in ${specFile}`).toBe(true);
    expect(toks, `${name} differs from ${specFile}`).toEqual(spec.get(name));
    covered.push(name);
  }
  expect(covered.sort()).toEqual([...spec.keys()].sort());
}

describe('specification', () => {
  it('the daemon queries are the documents of spec/operations.graphql', () => {
    expectDocumentsAreTheSpec('spec/operations.graphql', ALL_DOCUMENTS);
  });

  it('the ITN queries are the documents of spec/itn-operations.graphql', () => {
    expectDocumentsAreTheSpec('spec/itn-operations.graphql', ALL_ITN_DOCUMENTS);
  });
});
