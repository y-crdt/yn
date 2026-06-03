'use strict'

// Runtime loader for the @y-crdt/yn native addon.
//
// The published package is a single "fat" tarball that bundles one prebuilt
// `index-<triple>.node` binary per supported platform. This loader selects the
// binary matching the host platform/arch. When developing locally it falls back
// to a freshly built `index.node` (the output of `npm run build`).

const { platform, arch } = process

function targetTriple () {
  if (platform === 'darwin' && arch === 'arm64') return 'darwin-arm64'
  if (platform === 'darwin' && arch === 'x64') return 'darwin-x64'
  if (platform === 'linux' && arch === 'x64') return 'linux-x64-gnu'
  if (platform === 'linux' && arch === 'arm64') return 'linux-arm64-gnu'
  if (platform === 'win32' && arch === 'x64') return 'win32-x64-msvc'
  return null
}

function load () {
  const triple = targetTriple()
  if (triple) {
    try {
      return require(`./index-${triple}.node`)
    } catch (_) {
      /* fall through to local dev build */
    }
  }
  try {
    return require('./index.node')
  } catch (_) {
    /* fall through to error */
  }
  throw new Error(
    `@y-crdt/yn: no prebuilt binary available for ${platform}-${arch}`
  )
}

module.exports = load()
