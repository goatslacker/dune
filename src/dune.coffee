vm = require 'vm'
fs = require 'fs'
path = require 'path'
Module = require 'module'
{ EventEmitter } = require 'events'

getContext = (sandbox) ->
  context = {
    setTimeout: setTimeout
    setInterval: setInterval
    clearTimeout: clearTimeout
    clearInterval: clearInterval
    Buffer: Buffer
    ArrayBuffer: ArrayBuffer
    Int8Array: Int8Array
    UInt8Array: Uint8Array
    Int16Array: Int16Array
    UInt16Array: Uint16Array
    Int32Array: Int32Array
    UInt32Array: Uint32Array
    Float32Array: Float32Array
    Float64Array: Float64Array
    console: console
  }

  Object.keys(sandbox).forEach (key) -> context[key] = sandbox[key]

  context


run = (wrapped, context, imports, filename, dirname) ->
  dune = exports: {}

  imports ?= (file) ->
    start = file.substring(0, 2)
    file = path.join(dirname, file)  if start is './' or start is '..'
    require file

  if context
    context = getContext context
    fn = vm.runInNewContext wrapped, context, filename
  else
    fn = vm.runInThisContext wrapped, filename

  try
    fn.call fn, dune.exports, imports, dune, filename, dirname
  catch err
    process.stderr.write err.stack
    process.stderr.write '\n'

  dune.exports


module.exports = (file, sandbox, imports) ->
  basename = path.basename file
  dirname = path.dirname file

  data = fs.readFileSync file, 'utf-8'

  if file.match /.coffee$/
    try
      coffee = require 'coffee-script'
      data = coffee.compile data
    catch err
      throw err

  code = Module.wrap data
  run code, sandbox, imports, basename, dirname
