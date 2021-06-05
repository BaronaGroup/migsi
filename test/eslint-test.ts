import * as cp from 'child_process'

describe('eslint-test', function () {
  it(
    'eslint should pass',
    process.env.MIGSI_SKIP_ESLINT
      ? undefined
      : function () {
          this.timeout(10000)
          cp.execSync('npm run eslint')
        }
  )
})
