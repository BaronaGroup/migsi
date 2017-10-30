import {wipeWorkspace, configure, runMigrations, replaceInFile, createMigration} from './test-utils'
  import {assert} from 'chai'

let sequence : string[] = []

export const addToSequence = (...args : string[]) => {
  sequence.push(args.join(' '))
}


export const using = (id : string) => {
  return {
    async open() {
      sequence.push('+' + id)
      return id
    },
    async close() {
      sequence.push('-' + id)
    }
  }
}

describe('using-test', function () {

  beforeEach(function () {
    wipeWorkspace()
    sequence = []
  })

  describe('various forms of declaring using modules', function () {
    it('in configuration', async function() {
      configure({using: {'1': using('1')}})
      createUsingMigration('m1', {
        using: ['1']
      })
      await runMigrations()
      assert.deepEqual(sequence, [
        '+1',
        'm1 1',
        '-1'
      ])
    })

    it('inline', async function() {
      configure()
      const filename = createUsingMigration('m1', {
        using: ['TOKEN']
      })
      await replaceInFile(filename, '"TOKEN"', `require('../test/using-test').using('99')`)
      await runMigrations()
      assert.deepEqual(sequence, [
        '+99',
        'm1 99',
        '-99'
      ])
    })

    it('with setup', async function() {
      configure({using: {'x': {
        setup() {
          return {
            open() {
              addToSequence('+x')
              return 'x'
            },
            close() {
              addToSequence('-x')
            }
          }
        }
      }}})
      createUsingMigration('m1', {
        using: ['x']
      })
      await runMigrations()
      assert.deepEqual(sequence, [
        '+x',
        'm1 x',
        '-x'
      ])
    })

    it('simple', async function() {
      configure({using: {'q': () => 'q'}})
      createUsingMigration('m1', {
        using: ['q']
      })
      await runMigrations()
      assert.deepEqual(sequence, [
        'm1 q'
      ])
    })

  })

  describe('utilizing using', function () {
    before(function() {
      configure({
        using: {
          'a': using('a'),
          'b': using('b'),
          'c': using('c')
        }
      })
    })

    it('initializes the using for the migration and closes after', async function() {
      createUsingMigration('m1', {
        using: ['a']
      })
      await runMigrations()
      assert.deepEqual(sequence, [
        '+a',
        'm1 a',
        '-a'
      ])
    })

    it('shares the object between multiple migrations that need it', async function() {
      createUsingMigration('m1', {
        using: ['a']
      })
      createUsingMigration('m2', {
        using: ['a'],
        dependencies: ['m1']
      })
      await runMigrations()
      assert.deepEqual(sequence, [
        '+a',
        'm1 a',
        'm2 a',
        '-a'
      ])
    })

    it('unloads the object once no migration needs it', async function() {
      createUsingMigration('m1', {
        using: ['a']
      })
      createUsingMigration('m2', {
        using: ['a'],
        dependencies: ['m1']
      })
      createUsingMigration('m3', {
        dependencies: ['m2']
      })
      await runMigrations()
      assert.deepEqual(sequence, [
        '+a',
        'm1 a',
        'm2 a',
        '-a',
        'm3'
      ])
    })

    it('multiple usings are supported', async function() {
      createUsingMigration('m1', {
        using: ['a', 'b']
      })
      await runMigrations()
      assert.deepEqual(sequence, [
        '+a',
        '+b',
        'm1 a b',
        '-a',
        '-b'
      ])
    })
  })
})


function createUsingMigration(name : string, args : object) {
  const withWrapper = Object.assign({},
    args,

    { run: `async function(...args) {
      const { addToSequence } = require('../test/using-test')
      addToSequence(this.friendlyName, ...args)
    }`})
  return createMigration(name, withWrapper)
}
