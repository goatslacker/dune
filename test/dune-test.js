// Generated by CoffeeScript 1.8.0
(function() {
  var assert, directory, dune, path, tests, vows;

  dune = require('../');

  path = require('path');

  vows = require('vows');

  assert = require('assert');

  directory = path.join(__dirname, 'fixtures');

  tests = vows.describe('dune');

  tests.addBatch({
    'when running a program using dune': {
      topic: function() {
        return dune.file(path.join(directory, 'file1.js'));
      },
      'function is exported': function(r) {
        return assert.isFunction(r);
      },
      'when calling that function': {
        'should return hello world': function(r) {
          return assert.equal(r(), 'Hello World');
        }
      },
      'global set by file1 should be available': function(r) {
        assert.isNotNull(globals_can_be_set);
        return assert.equal(globals_can_be_set, 'yes');
      }
    }
  });

  tests.addBatch({
    'when running code using dune': {
      'and providing a filename': {
        topic: function() {
          return dune.string('module.exports = 2', path.join(directory, 'nonexistent'));
        },
        'number is exported': function(r) {
          return assert.isNumber(r);
        },
        'should be 2': function(r) {
          return assert.equal(r, 2);
        }
      },
      'and not providing a filename': {
        topic: function() {
          return dune.string('module.exports = 2');
        },
        'number is exported': function(r) {
          return assert.isNumber(r);
        },
        'should be 2': function(r) {
          return assert.equal(r, 2);
        }
      },
      'and using require for relative path': {
        topic: function() {
          return dune.string('module.exports = require("./file3.js")', path.join(directory, 'testfile'));
        },
        'Vows is exported': function(r) {
          return assert.isNotNull(r);
        },
        'should have an inspect function': function(r) {
          return assert.isFunction(r.inspect);
        }
      }
    }
  });

  tests["export"](module);

}).call(this);
