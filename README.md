# Dune

## Install

    npm install dune

## API

*file()*

    var assert = require('assert');
    var path = require('path');

    var exports = dune.file(path.join(__dirname, 'myfile.js'));

    assert.equal(exports, 'hello');

`myfile.js`

    module.exports = 'hello';


*sting()*

    var assert = require('assert');

    var exports = dune.string('module.exports = "hello"');

    assert.equal(exports, 'hello');

NOTE! If using require in your code, you will need to pass in the directory
where the code should 'live'. Example:

    var assert = require('assert');
    var path = require('path');

    var exports = dune.string(
      'module.exports = require("./myfile.js")',
      path.join(__dirname, 'testfile')
    );

    assert.equal(exports, 'hello');

## License

[MIT-LICENSE](http://josh.mit-license.org)
