const cp = require('child_process')

describe('eslint-test', function() {
  it('eslint should pass', function() {
    cp.execSync('npm run eslint')
  })
})