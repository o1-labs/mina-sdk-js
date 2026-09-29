// Offline check of the ITN documents against schema/itn_graphql_schema.json:
// every selected field must exist on its type and every argument on its
// field. The documents are simple (no fragments or aliases), so a small
// parser is enough.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { ALL_ITN_DOCUMENTS } from '../src/itn/queries.js';

interface TypeRef {
  name: string | null;
  ofType: TypeRef | null;
}
interface Field {
  name: string;
  args: Array<{ name: string }>;
  type: TypeRef;
}
interface SchemaType {
  name: string;
  fields: Field[] | null;
}

const schema = JSON.parse(
  readFileSync(new URL('../schema/itn_graphql_schema.json', import.meta.url), 'utf8'),
).data.__schema as {
  queryType: { name: string };
  mutationType: { name: string };
  types: SchemaType[];
};
const types = new Map(schema.types.map((t) => [t.name, t]));
const base = (t: TypeRef): string => t.name ?? base(t.ofType!);

function checkSelection(ty: string, toks: string[], i: number): [number, string] {
  i++;
  while (toks[i] !== '}') {
    const name = toks[i];
    const field = types.get(ty)?.fields?.find((f) => f.name === name);
    if (!field) return [i, `${ty}.${name} is not in the ITN schema`];
    i++;
    if (toks[i] === '(') {
      for (i++; toks[i] !== ')'; i++) {
        if (toks[i + 1] === ':' && !toks[i].startsWith('$')) {
          if (!field.args.some((a) => a.name === toks[i])) {
            return [i, `${ty}.${name} has no argument ${toks[i]}`];
          }
        }
      }
      i++;
    }
    if (toks[i] === '{') {
      const [next, problem] = checkSelection(base(field.type), toks, i);
      if (problem) return [next, problem];
      i = next;
    }
  }
  return [i + 1, ''];
}

function check(doc: string): string {
  const toks = doc.match(/[A-Za-z0-9_$]+|[(){}:!,[\]]/g) ?? [];
  const root = toks[0] === 'mutation' ? schema.mutationType.name : schema.queryType.name;
  let depth = 0;
  for (let i = 0; i < toks.length; i++) {
    if (toks[i] === '(') depth++;
    else if (toks[i] === ')') depth--;
    else if (toks[i] === '{' && depth === 0) return checkSelection(root, toks, i)[1];
  }
  return 'no selection set';
}

describe('ITN documents', () => {
  it('match the vendored ITN schema', () => {
    for (const doc of ALL_ITN_DOCUMENTS) expect(check(doc), doc).toBe('');
  });

  it('the checker catches drift', () => {
    expect(check('query { auth { serverUuid noSuchField } }')).toContain(
      'is not in the ITN schema',
    );
    expect(check('mutation ($x: Int!) { flushInternalLogs(noSuchArg: $x) }')).toContain(
      'has no argument',
    );
    // stopPayments: a name hand-written clients used; the daemon lacks it.
    expect(check('mutation ($h: String!) { stopPayments(handle: $h) }')).toContain(
      'is not in the ITN schema',
    );
  });
});
