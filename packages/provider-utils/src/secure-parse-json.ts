// Licensed under BSD-3-Clause (this file only)
// Code adapted from https://github.com/fastify/secure-json-parse/blob/783fcb1b5434709466759847cec974381939673a/index.js
//
// Copyright (c) Vercel, Inc. (https://vercel.com)
// Copyright (c) 2019 The Fastify Team
// Copyright (c) 2019, Sideway Inc, and project contributors
// All rights reserved.
// 
// The complete list of contributors can be found at:
// - https://github.com/hapijs/bourne/graphs/contributors
// - https://github.com/fastify/secure-json-parse/graphs/contributors
// - https://github.com/vercel/ai/commits/main/packages/provider-utils/src/secure-parse-json.ts
// 
// Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
//
// 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
//
// 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
//
// 3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

'use strict'

const hasBuffer = typeof Buffer !== 'undefined'
const suspectProtoRx = /"(?:_|\\u005[Ff])(?:_|\\u005[Ff])(?:p|\\u0070)(?:r|\\u0072)(?:o|\\u006[Ff])(?:t|\\u0074)(?:o|\\u006[Ff])(?:_|\\u005[Ff])(?:_|\\u005[Ff])"\s*:/
const suspectConstructorRx = /"(?:c|\\u0063)(?:o|\\u006[Ff])(?:n|\\u006[Ee])(?:s|\\u0073)(?:t|\\u0074)(?:r|\\u0072)(?:u|\\u0075)(?:c|\\u0063)(?:t|\\u0074)(?:o|\\u006[Ff])(?:r|\\u0072)"\s*:/

function _parse(text, reviver, options) {
  // Normalize arguments
  if (options == null) {
    if (reviver !== null && typeof reviver === 'object') {
      options = reviver
      reviver = undefined
    }
  }

  if (hasBuffer && Buffer.isBuffer(text)) {
    text = text.toString()
  }

  // BOM checker
  if (text && text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1)
  }

  // Parse normally, allowing exceptions
  const obj = JSON.parse(text, reviver)

  // Ignore null and non-objects
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  const protoAction = (options && options.protoAction) || 'error'
  const constructorAction = (options && options.constructorAction) || 'error'

  // options: 'error' (default) / 'remove' / 'ignore'
  if (protoAction === 'ignore' && constructorAction === 'ignore') {
    return obj
  }

  if (protoAction !== 'ignore' && constructorAction !== 'ignore') {
    if (suspectProtoRx.test(text) === false && suspectConstructorRx.test(text) === false) {
      return obj
    }
  } else if (protoAction !== 'ignore' && constructorAction === 'ignore') {
    if (suspectProtoRx.test(text) === false) {
      return obj
    }
  } else {
    if (suspectConstructorRx.test(text) === false) {
      return obj
    }
  }

  // Scan result for proto keys
  return filter(obj, { protoAction, constructorAction, safe: options && options.safe })
}

function filter(obj, { protoAction = 'error', constructorAction = 'error', safe } = {}) {
  let next = [obj]

  while (next.length) {
    const nodes = next
    next = []

    for (const node of nodes) {
      if (protoAction !== 'ignore' && Object.prototype.hasOwnProperty.call(node, '__proto__')) { // Avoid calling node.hasOwnProperty directly
        if (safe === true) {
          return null
        } else if (protoAction === 'error') {
          throw new SyntaxError('Object contains forbidden prototype property')
        }

        delete node.__proto__ // eslint-disable-line no-proto
      }

      if (constructorAction !== 'ignore' &&
        Object.prototype.hasOwnProperty.call(node, 'constructor') &&
        Object.prototype.hasOwnProperty.call(node.constructor, 'prototype')) { // Avoid calling node.hasOwnProperty directly
        if (safe === true) {
          return null
        } else if (constructorAction === 'error') {
          throw new SyntaxError('Object contains forbidden prototype property')
        }

        delete node.constructor
      }

      for (const key in node) {
        const value = node[key]
        if (value && typeof value === 'object') {
          next.push(value)
        }
      }
    }
  }
  return obj
}

function parse(text, reviver, options) {
  const { stackTraceLimit } = Error
  Error.stackTraceLimit = 0
  try {
    return _parse(text, reviver, options)
  } finally {
    Error.stackTraceLimit = stackTraceLimit
  }
}

function safeParse(text, reviver) {
  const { stackTraceLimit } = Error
  Error.stackTraceLimit = 0
  try {
    return _parse(text, reviver, { safe: true })
  } catch {
    return undefined
  } finally {
    Error.stackTraceLimit = stackTraceLimit
  }
}

module.exports = parse
module.exports.default = parse
module.exports.parse = parse
module.exports.safeParse = safeParse
module.exports.scan = filter