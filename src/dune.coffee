vm = require 'vm'
fs = require 'fs'
path = require 'path'
Module = require 'module'
NativeModules = process.binding 'natives'
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


loadPackage = (filepath) ->
  try
    jsonpath = path.resolve filepath, 'package.json'
    json = (fs.readFileSync jsonpath).toString()
    pkg = JSON.parse json
    init = pkg.main or 'index.js'
    init = "#{init}.js" unless path.extname init
    init
  catch ex
    'index.js'


statPath = (path) ->
  try
    return fs.statSync path
  catch ex
    ex


tryFile = (file) ->
  stats = statPath file

  if stats instanceof Error
    return false

  return file unless stats.isDirectory()

  # look for package.json if it's a directory
  pkg = loadPackage file
  return path.resolve file, pkg


findPackage = (filepath) ->

  paths = [filepath]
  paths.push "#{filepath}.js" unless path.extname filepath
  paths.push.apply paths, process.mainModule.paths.map (dir) ->
    path.resolve dir, filepath

  for fullpath in paths
    file = tryFile fullpath
    break unless file is false

  file


genImports = (dirname) ->
  (file) ->
    if NativeModules.hasOwnProperty file
      exports.string NativeModules[file], file, {}
    else
      start = file.substring(0, 2)
      file = path.join(dirname, file)  if start is './' or start is '..'
      file = findPackage file

      exports.file file, {}


run = (wrapped, context, imports, filename, dirname) ->
  dune = exports: {}

  imports ?= genImports dirname

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
