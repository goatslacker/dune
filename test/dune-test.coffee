dune = require '../'
path = require 'path'
vows = require 'vows'
assert = require 'assert'

directory = path.join __dirname, 'fixtures'

tests = vows.describe 'dune'
tests.addBatch
  'when running a program using dune':
    topic: ->
      fn = dune path.join directory, 'file1.js'

    'function is exported': (r) ->
      assert.isFunction r

    'when calling that function':
      'should return hello world': (r) ->
        assert.equal r(), 'Hello World'

    'global set by file1 should be available': (r) ->
      assert.isNotNull globals_can_be_set
      assert.equal globals_can_be_set, 'yes'

tests.export module
