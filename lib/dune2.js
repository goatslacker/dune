// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var NativeModule = require('module')
var Script = require('vm')
var runInThisContext = Script.runInThisContext
var runInNewContext = Script.runInNewContext
var assert = require('assert').ok
var fs = require('fs')
var path = require('path')

var NativeModules = process.binding('natives');

function exists(id) {
  return NativeModules.hasOwnProperty(id);
}

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop)
}

function Module(id, parent) {
  this.id = id
  this.exports = {}
  this.parent = parent
  if (parent && parent.children) {
    parent.children.push(this)
  }

  this.filename = null
  this.loaded = false
  this.children = []
}

// Set the environ variable NODE_MODULE_CONTEXTS=1 to make node load all
// modules in their own context.
Module._contextLoad = (+process.env['NODE_MODULE_CONTEXTS'] > 0)
Module._cache = {}
Module._pathCache = {}
Module._extensions = {}
var modulePaths = []
Module.globalPaths = []

Module.wrapper = NativeModule.wrapper
Module.wrap = NativeModule.wrap

Module.prototype.load = function(filename) {
  assert(!this.loaded)
  this.filename = filename
  this.paths = nodeModulePaths(path.dirname(filename))
}

Module.prototype.run = function(filename) {
  var extension = path.extname(filename) || '.js'
  if (!Module._extensions[extension]) extension = '.js'
  Module._extensions[extension](this, filename)
  this.loaded = true
}

Module.prototype.require = function(path) {
  assert(typeof path === 'string', 'path must be a string')
  assert(path, 'missing path')
  return dune2.file(path, this)
}

Module.prototype.compile = function(content, filename, context) {
  var self = this
  context = context || {}
  // remove shebang
  content = content.replace(/^\#\!.*/, '')

  function require(path) {
    return self.require(path)
  }

  require.resolve = function(request) {
    return resolveFilename(request, self)
  }

  Object.defineProperty(require, 'paths', { get: function() {
    throw new Error('require.paths is removed. Use ' +
                    'node_modules folders, or the NODE_PATH ' +
                    'environment variable instead.')
  }})

  require.main = process.mainModule

  // Enable support to add extra extension types
  require.extensions = Module._extensions

  require.cache = Module._cache

  var dirname = path.dirname(filename)

  if (Module._contextLoad) {
    if (self.id !== '.') {
      // not root module
      var sandbox = {}
      for (var k in global) {
        sandbox[k] = global[k]
      }
      for (var k in context) {
        sandbox[k] = context[k]
      }
      sandbox.require = require
      sandbox.exports = self.exports
      sandbox.__filename = filename
      sandbox.__dirname = dirname
      sandbox.module = self
      sandbox.global = sandbox
      sandbox.root = root

      return runInNewContext(content, sandbox, filename, true)
    }

    // root module
    global.require = require
    global.exports = self.exports
    global.__filename = filename
    global.__dirname = dirname
    global.module = self

    return runInThisContext(content, filename, true)
  }

  // create wrapper function
  var wrapper = Module.wrap(content)

  var compiledWrapper = runInThisContext(wrapper, filename, true)
  var args = [self.exports, require, self, filename, dirname]
  return compiledWrapper.apply(self.exports, args)
}

// given a module name, and a list of paths to test, returns the first
// matching file in the following precedence.
//
// require("a.<ext>")
//   -> a.<ext>
//
// require("a")
//   -> a
//   -> a.<ext>
//   -> a/index.<ext>

function statPath(path) {
  try {
    return fs.statSync(path)
  } catch (ex) {}
  return false
}

// check if the directory is a package.json dir
var packageMainCache = {}

function readPackage(requestPath) {
  if (hasOwnProperty(packageMainCache, requestPath)) {
    return packageMainCache[requestPath]
  }

  try {
    var jsonPath = path.resolve(requestPath, 'package.json')
    var json = fs.readFileSync(jsonPath, 'utf8')
  } catch (e) {
    return false
  }

  try {
    var pkg = packageMainCache[requestPath] = JSON.parse(json).main
  } catch (e) {
    e.path = jsonPath
    e.message = 'Error parsing ' + jsonPath + ': ' + e.message
    throw e
  }
  return pkg
}

function tryPackage(requestPath, exts) {
  var pkg = readPackage(requestPath)

  if (!pkg) return false

  var filename = path.resolve(requestPath, pkg)
  return tryFile(filename) || tryExtensions(filename, exts) ||
         tryExtensions(path.resolve(filename, 'index'), exts)
}

// In order to minimize unnecessary lstat() calls,
// this cache is a list of known-real paths.
// Set to an empty object to reset.
Module._realpathCache = {}

// check if the file exists and is not a directory
function tryFile(requestPath) {
  var stats = statPath(requestPath)
  if (stats && !stats.isDirectory()) {
    return fs.realpathSync(requestPath, Module._realpathCache)
  }
  return false
}

// given a path check a the file exists with any of the set extensions
function tryExtensions(p, exts) {
  for (var i = 0, EL = exts.length; i < EL; i++) {
    var filename = tryFile(p + exts[i])

    if (filename) {
      return filename
    }
  }
  return false
}

function findPath(request, paths) {
  var exts = Object.keys(Module._extensions)

  if (request.charAt(0) === '/') {
    paths = ['']
  }

  var trailingSlash = (request.slice(-1) === '/')

  var cacheKey = JSON.stringify({request: request, paths: paths})
  if (Module._pathCache[cacheKey]) {
    return Module._pathCache[cacheKey]
  }

  // For each path
  for (var i = 0, PL = paths.length; i < PL; i++) {
    var basePath = path.resolve(paths[i], request)
    var filename

    if (!trailingSlash) {
      // try to join the request to the path
      filename = tryFile(basePath)

      if (!filename && !trailingSlash) {
        // try it with each of the extensions
        filename = tryExtensions(basePath, exts)
      }
    }

    if (!filename) {
      filename = tryPackage(basePath, exts)
    }

    if (!filename) {
      // try it with each of the extensions at "index"
      filename = tryExtensions(path.resolve(basePath, 'index'), exts)
    }

    if (filename) {
      Module._pathCache[cacheKey] = filename
      return filename
    }
  }
  return false
}

// 'from' is the __dirname of the module.
function nodeModulePaths(from) {
  // guarantee that 'from' is absolute.
  from = path.resolve(from)

  // note: this approach *only* works when the path is guaranteed
  // to be absolute.  Doing a fully-edge-case-correct path.split
  // that works on both Windows and Posix is non-trivial.
  var splitRe = process.platform === 'win32' ? /[\/\\]/ : /\//
  // yes, '/' works on both, but let's be a little canonical.
  var joiner = process.platform === 'win32' ? '\\' : '/'
  var paths = []
  var parts = from.split(splitRe)

  for (var tip = parts.length - 1; tip >= 0; tip--) {
    // don't search in .../node_modules/node_modules
    if (parts[tip] === 'node_modules') continue
    var dir = parts.slice(0, tip + 1).concat('node_modules').join(joiner)
    paths.push(dir)
  }

  return paths
}

function resolveLookupPaths(request, parent) {
  if (exists(request)) {
    return [request, []]
  }

  var start = request.substring(0, 2)
  if (start !== './' && start !== '..') {
    var paths = modulePaths
    if (parent) {
      if (!parent.paths) parent.paths = []
      paths = parent.paths.concat(paths)
    }
    return [request, paths]
  }

  // with --eval, parent.id is not set and parent.filename is null
  if (!parent || !parent.id || !parent.filename) {
    // make require('./path/to/foo') work - normally the path is taken
    // from realpath(__filename) but with eval there is no filename
    var mainPaths = ['.'].concat(modulePaths)
    mainPaths = nodeModulePaths('.').concat(mainPaths)
    return [request, mainPaths]
  }

  // Is the parent an index module?
  // We can assume the parent has a valid extension,
  // as it already has been accepted as a module.
  var isIndex = /^index\.\w+?$/.test(path.basename(parent.filename))
  var parentIdPath = isIndex ? parent.id : path.dirname(parent.id)
  var id = path.resolve(parentIdPath, request)

  // make sure require('./path') and require('path') get distinct ids, even
  // when called from the toplevel js file
  if (parentIdPath === '.' && id.indexOf('/') === -1) {
    id = './' + id
  }

  return [id, [path.dirname(parent.filename)]]
}

function resolveFilename(request, parent) {
  if (exists(request)) {
    return request
  }

  var resolvedModule = resolveLookupPaths(request, parent)
  var id = resolvedModule[0]
  var paths = resolvedModule[1]

  var filename = findPath(request, paths)
  if (!filename) {
    var err = new Error("Cannot find module '" + request + "'")
    err.code = 'MODULE_NOT_FOUND'
    throw err
  }
  return filename
}

function stripBOM(content) {
  // Remove byte order marker. This catches EF BB BF (the UTF-8 BOM)
  // because the buffer-to-string conversion in `fs.readFileSync()`
  // translates it to FEFF, the UTF-16 BOM.
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1)
  }
  return content
}

// Native extension for .js
Module._extensions['.js'] = function(module, filename) {
  var content = fs.readFileSync(filename, 'utf8')
  module.compile(stripBOM(content), filename)
}

// Native extension for .json
Module._extensions['.json'] = function(module, filename) {
  var content = fs.readFileSync(filename, 'utf8')
  try {
    module.exports = JSON.parse(stripBOM(content))
  } catch (err) {
    err.message = filename + ': ' + err.message
    throw err
  }
}

function initPaths() {
  var isWindows = process.platform === 'win32'

  if (isWindows) {
    var homeDir = process.env.USERPROFILE
  } else {
    var homeDir = process.env.HOME
  }

  var paths = [path.resolve(process.execPath, '..', '..', 'lib', 'node')]

  if (homeDir) {
    paths.unshift(path.resolve(homeDir, '.node_libraries'))
    paths.unshift(path.resolve(homeDir, '.node_modules'))
  }

  var nodePath = process.env['NODE_PATH']
  if (nodePath) {
    var splitter = isWindows ? '' : ':'
    paths = nodePath.split(splitter).concat(paths)
  }

  modulePaths = paths

  // clone as a read-only copy, for introspection.
  Module.globalPaths = modulePaths.slice(0)
}
initPaths()

var dune2 = {
  string: function (content, filename, context) {
    var module = new Module(filename, null)
    process.mainModule = module
    module.id = '.'
    Module._cache[filename] = module

    var hadException = true

    try {
      module.load(filename)
      module.compile(stripBOM(content), filename, context)
      hadException = false
    } finally {
      if (hadException) {
        delete Module._cache[filename]
      }
    }

    return module.exports
  },

  file: function (file, parent, isMain) {
    var filename = resolveFilename(file, parent)

    var cachedModule = Module._cache[filename]
    if (cachedModule) {
      return cachedModule.exports
    }

    if (exists(filename)) {
      return require(filename)
    }

    var module = new Module(filename, parent)

    if (isMain) {
      process.mainModule = module
      module.id = '.'
    }

    Module._cache[filename] = module

    var hadException = true

    try {
      module.load(filename)
      module.run(filename)
      hadException = false
    } finally {
      if (hadException) {
        delete Module._cache[filename]
      }
    }

    return module.exports
  }
}

module.exports = dune2
