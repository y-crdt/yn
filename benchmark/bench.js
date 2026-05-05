'use strict';

const fs = require('fs')
const zlib = require('zlib')
const Y = require('yjs');
const { Bench } = require('tinybench');
const yn = require('yn');
const ywasm = require('ywasm');

const generateUpdates = (filename) => {
    const {startContent, endContent, txns} = JSON.parse(
        filename.endsWith('.gz')
            ? zlib.gunzipSync(fs.readFileSync(filename))
            : fs.readFileSync(filename, 'utf-8')
    )
    const updates = []
    const doc = new Y.Doc()
    doc.on('update', (u) => updates.push(u))
    const text = doc.getText('t')
    if (startContent && startContent !== '') {
        text.push(startContent)
    }
    for (const {patches} of txns) {
        Y.transact(doc, () => {
          for (const [pos, del, chunk] of patches) {
              if (del !== 0) {
                  text.delete(pos, del)
              }
              if (chunk && chunk !== '') {
                  text.insert(pos, chunk)
              }
          }
        })
    }
    return updates
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
  const updates = generateUpdates('./benchmark/automerge-paper.json.gz')
  const info = sanityCheck(updates);
  console.log(
    `[sanity] n=${updates.length}: same-text=ok yn-bytes-eq-yjs=${info.sameYn} ywasm-bytes-eq-yjs=${info.sameYwasm} merged-bytes=${info.len}`
  );

  const bench = new Bench({ time: 0, warmupTime: 0, iterations: 5, warmupIterations: 1 });
  const length = updates.length
  bench.add(`yjs   merge ${length} updates`, () => {
    yjsMerge(updates);
  });
  bench.add(`ywasm merge ${length} updates`, () => {
    ywasmMerge(updates);
  });
  bench.add(`yn    merge ${length} updates`, () => {
    ynMerge(updates);
  });


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
