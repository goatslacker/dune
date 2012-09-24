[![build status](https://secure.travis-ci.org/goatslacker/dune.png)](http://travis-ci.org/goatslacker/dune)
# Dune

> An easy to use VM for loading and running scripts.

You pass it code, it returns back its `module.exports`

## Install

    npm install dune

## API

**file()** = (*full_path_to_file*, *optional_context*, *custom_require*) ->

    var assert = require('assert');
    var path = require('path');

    var exports = dune.file(path.join(__dirname, 'myfile.js'));

    assert.equal(exports, 'hello');

`myfile.js`

    module.exports = 'hello';


**string()** = (*code_to_run*, *path_to_code*, *context*, *custom_require*) ->

    var assert = require('assert');

    var exports = dune.string('module.exports = "hello"');

    assert.equal(exports, 'hello');

NOTE! If using node's `require()` in your code, you will need to pass in the full path
where the code would theoretically be present at. Example:

    var assert = require('assert');
    var path = require('path');

    var exports = dune.string(
      'module.exports = require("./myfile.js")',
      path.join(__dirname, 'test.vm')
    );

    assert.equal(exports, 'hello');

## License

[MIT-LICENSE](http://josh.mit-license.org)
