// ESM entry point. Native `.node` addons must be loaded through `require`, so we
// bridge to the CommonJS loader and re-export its bindings.
import { createRequire } from 'node:module'

const binding = createRequire(import.meta.url)('./load.cjs')

export const applyUpdates = binding.applyUpdates
export default binding
