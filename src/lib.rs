use neon::context::{Context, Cx};
use neon::handle::Handle;
use neon::object::Object;
use neon::result::JsResult;
use neon::types::{JsArray, JsUint8Array};
use neon::types::buffer::TypedArray;
use yrs::updates::decoder::Decode;
use yrs::{Doc, Options, ReadTxn, StateVector, Transact, Update};

#[neon::export(name = "mergeUpdates")]
fn merge_updates<'cx>(
    cx: &mut Cx<'cx>,
    gc: bool,
    updates: Handle<'cx, JsArray>,
) -> JsResult<'cx, JsUint8Array> {
    let len = updates.len(cx);
    let mut decoded: Vec<Update> = Vec::with_capacity(len as usize);
    for i in 0..len {
        let item: Handle<JsUint8Array> = updates.get(cx, i)?;
        let parsed = {
            let slice = item.as_slice(cx);
            Update::decode_v1(slice)
        };
        match parsed {
            Ok(u) => decoded.push(u),
            Err(e) => return cx.throw_error(format!("failed to decode update at index {}: {}", i, e)),
        }
    }

    let opts = Options {
        skip_gc: !gc,
        ..Options::default()
    };
    let doc = Doc::with_options(opts);
    {
        let mut txn = doc.transact_mut();
        for update in decoded {
            if let Err(e) = txn.apply_update(update) {
                return cx.throw_error(format!("failed to apply update: {}", e));
            }
        }
    }

    let bytes = doc
        .transact()
        .encode_state_as_update_v1(&StateVector::default());

    JsUint8Array::from_slice(cx, &bytes)
}
