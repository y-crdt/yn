'use strict';

const Y = require('yjs');
const { Bench } = require('tinybench');
const yn = require('yn');
const ywasm = require('ywasm');

const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789\n';

function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function randomChunk(rng, maxLen) {
  const len = 1 + Math.floor(rng() * maxLen);
  let out = '';
  for (let i = 0; i < len; i++) {
    out += ALPHABET[Math.floor(rng() * ALPHABET.length)];
  }
  return out;
}

function generateUpdates(count, seed) {
  const rng = makeRng(seed);
  const doc = new Y.Doc({ gc: false });
  const text = doc.getText('t');
  const updates = [];
  doc.on('update', (u) => updates.push(u));

  for (let i = 0; i < count; i++) {
    const len = text.length;
    const r = rng();
    if (len > 0 && r < 0.35) {
      const at = Math.floor(rng() * len);
      const delLen = 1 + Math.floor(rng() * Math.min(8, len - at));
      text.delete(at, delLen);
    } else {
      const at = len === 0 ? 0 : Math.floor(rng() * (len + 1));
      text.insert(at, randomChunk(rng, 16));
    }
  }

  return updates;
}

function yjsMerge(updates) {
  const doc = new Y.Doc({ gc: true });
  Y.transact(doc, () => {
    for (const u of updates) Y.applyUpdate(doc, u);
  });
  return Y.encodeStateAsUpdate(doc);
}

function ynMerge(updates) {
  return yn.applyUpdates(true, updates);
}

function ywasmMerge(updates) {
  const doc = new ywasm.YDoc({ gc: true });
  const txn = doc.beginTransaction();
  try {
    for (const u of updates) txn.applyV1(u);
  } finally {
    txn.free();
  }
  return ywasm.encodeStateAsUpdate(doc);
}

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function sanityCheck(updates) {
  const yjsOut = yjsMerge(updates);
  const ynOut = ynMerge(updates);
  const ywasmOut = ywasmMerge(updates);

  const a = new Y.Doc();
  const b = new Y.Doc();
  const c = new Y.Doc();
  Y.applyUpdate(a, yjsOut);
  Y.applyUpdate(b, ynOut);
  Y.applyUpdate(c, ywasmOut);
  const ta = a.getText('t').toString();
  const tb = b.getText('t').toString();
  const tc = c.getText('t').toString();
  if (ta !== tb || ta !== tc) {
    throw new Error(
      `mismatch:\n yjs=${JSON.stringify(ta)}\n yn=${JSON.stringify(tb)}\n ywasm=${JSON.stringify(tc)}`
    );
  }
  return {
    sameYn: bytesEqual(yjsOut, ynOut),
    sameYwasm: bytesEqual(yjsOut, ywasmOut),
    len: yjsOut.length,
  };
}

async function main() {
  const sizes = [2, 10, 100];
  const fixtures = sizes.map((n) => ({
    n,
    updates: generateUpdates(n, 0xC0FFEE + n),
  }));

  for (const f of fixtures) {
    const info = sanityCheck(f.updates);
    console.log(
      `[sanity] n=${f.n}: same-text=ok yn-bytes-eq-yjs=${info.sameYn} ywasm-bytes-eq-yjs=${info.sameYwasm} merged-bytes=${info.len}`
    );
  }

  const bench = new Bench({ time: 1000, warmupTime: 200 });

  for (const { n, updates } of fixtures) {
    bench.add(`yjs   merge ${String(n).padStart(3)} updates`, () => {
      yjsMerge(updates);
    });
    bench.add(`ywasm merge ${String(n).padStart(3)} updates`, () => {
      ywasmMerge(updates);
    });
    bench.add(`yn    merge ${String(n).padStart(3)} updates`, () => {
      ynMerge(updates);
    });
  }

  await bench.run();

  console.log('');
  console.table(
    bench.tasks.map((t) => ({
      name: t.name,
      'ops/sec': t.result?.hz?.toFixed(0),
      'avg (µs)': (t.result?.mean * 1000).toFixed(2),
      'p99 (µs)': (t.result?.p99 * 1000).toFixed(2),
      samples: t.result?.samples.length,
    }))
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
