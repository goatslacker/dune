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
    process: process
    console: console
  }

  Object.keys(sandbox).forEach (key) -> context[key] = sandbox[key]

  context


run = (wrapped, context, imports, filename, dirname) ->
  dune = exports: {}

  imports ?= (file) ->
    start = file.substring(0, 2)
    file = path.join(dirname, file)  if start is './' or start is '..'
    file = tryFile file
    exports.file file, {}

  if context
    context = getContext context
    context.process.mainModule.filename = filename
    fn = vm.runInNewContext wrapped, context, filename
  else
    fn = vm.runInThisContext wrapped, filename

  try
    fn.call fn, dune.exports, imports, dune, filename, dirname
  catch err
    throw err

  dune.exports


statPath = (path) ->
  try
    return fs.statSync path
  catch ex
    ex


loadPackage = (filepath) ->
  try
    jsonpath = path.resolve filepath, 'package.json'
    json = (fs.readFileSync jsonpath).toString()
    pkg = JSON.parse json
    pkg.main or 'index.js'
  catch ex
    'index.js'


tryFile = (filepath) ->
  stats = statPath filepath

  # try an extension if the filepath has none
  if stats instanceof Error
    return tryFile "#{filepath}.js" unless path.extname filepath
    throw stats

  return filepath unless stats.isDirectory()

  # look for package.json if it's a directory
  pkg = loadPackage filepath
  return path.resolve filepath, pkg


exports.file = (file, sandbox, imports) ->
  data = fs.readFileSync file, 'utf-8'

  exports.string data, file, sandbox, imports


exports.string = (data, file = 'Anonymous', sandbox, imports) ->
  basename = path.basename file
  dirname = path.dirname file

  if file.match /.coffee$/
    try
      coffee = require 'coffee-script'
      data = coffee.compile data
    catch err
      throw err

  code = Module.wrap data
  run code, sandbox, imports, basename, dirname
