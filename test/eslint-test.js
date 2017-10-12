const cp = require('child_process')

describe('eslint-test', function() {
  it('eslint should pass', process.env.MIGSI_SKIP_ESLINT ? undefined : function() {
    cp.execSync('npm run eslint')
  })
})