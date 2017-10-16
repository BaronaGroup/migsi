# migsi
A node.js migration tool

## Requirements

- node.js: 6+

For node.js major versions 6 and 7 the code goes through babel. On node.js versions 8 and above babel is
not used, instead the native support for all the features is used. 

## Command-line tool

Migsi comes with a command-line tool for some common tasks. It is installed to become your `node_modules/.bin/migsi`,
but if you want to use it you are probably best off creating a npm script for it. To do so just add

    "migsi": "migsi"
    
to the `scripts` section of your package.json. The examples below assume that such a script exists.

### list

    npm run migsi -- list
    
This command produces a list of all known migrations. They are listed in the order they were/will be run in.
The list includes the migration name and the date when it was run, or `to-be-run` in its place if it has not yet
been.

### create

    npm run migsi -- create 
    npm run migsi -- create --friendlyName="migration name here"
    npm run migsi -- create --friendlyName="migration name here" --template mongoMigrationScript
    
This command creates a new migration script. Unless provided, the template `default` is used. If migration script
is not provided on the command line, you are prompted for the script name and its template. The template is chosen
from custom templates and default.

The migration is created within the migration directory specified in the configuration, and you are then expected
to take care of implementing the functionality on your own.

### run

    npm run migsi -- run
    npm run migsi -- run --production
    
This command runs all the migration scripts that are to be run. If `--production` is given, only scripts that
haven't been marked to be "in development" are run.

This command requests confirmation from the user before actually running the migration scripts. This does not happen
if the process is not attached to a TTY or if `--yes` has been included on the command line.

    npm run migsi -- run --production --yes 
   
### ensure-no-development-scripts

    npm run migsi -- ensure-no-development-scripts
    
This command fails if any scripts are marked as being in development. This can be used in a hook or a test
to ensure that master branch only contains finished migration scripts, for example.

## Configuration

The configuration for migsi should usually be stored in a file called `.migsirc` in your repository root directory. 
This is only the default though; when using the command line tool you can use the `--config` option to specify another
configuration file, and you may override the path when using the API, too.

Some configuration variables can be overridden temporarily using environment variables as well.

The configuration should be in the form of a javascript file. It should export the configuration object. The configuration
is read using node's require, so `module.exports` is guaranteed to work, but a common transformation of `export default`
should work as well.  

### Configuration options

- `migrationDir`: the directory, in which migration scripts are to be stored; it may be relative to the location of the
  configuration file. The directory may contain other files as well -- migration scripts are identified amongst the files
  by their `.migsi.js` suffix.
  
- `templateDir`: the directory that contains custom migsi migration templates. Optional. It may be relative to the
  location of the configuration file.
  
- `failOnDevelopmentScriptsInProductionMode` if set to true, running migrations in production mode will fail if there are
  any migrations still in development. If set to false, such scripts are simply not run.
  
- `storage` sets up storage for migration status. See below for more information.

- `allowRerunningAllMigrations` allows all migrations to be re-run if needed. This essentially means that changes to
  past migration scripts causes all of its dependants to run.
  
- `using` allows declaring code dependencies for migration scripts. See the "using" section for more information on them.
  The dependencies in the configuration file are created as a mapping from the name to the actual implementation.
  
- `local` is reserved for application-specific customizations. It's all up to you.

- `prefixAlgorithm` can be used to provide an alternative algorithm (function) for deciding prefixes for migration names.
  It should be noted that when there are no dependencies defined, alphabetical order is used for the migration order,
  so it might not be a bad idea to have the prefix be based on the current moment of time.
  *PROTIP*: The prefix can even include a path, so you can do something like
  
        prefixAlgorithm: () => {
            const now = new Date()
            return now.getFullYear() + '/' + ('0' + (now.getMonth() + 1)).substr(-2) + '/'
        }
 
- `confirmation` is a function, which is called with an array of new migrations before any of them are run. If it returns
    a truthy value, the migrations are run. If the function returns a falsy value, the migration run is completed without 
    running any of the scripts (but they will still be queried about the nexttime); if it throws, running the migrations 
    throws. The function can return a promise that resolves to one of the specified values instead. If the call to 
    `runMigrations` also includes a confirmation, then the second parameter to this function is its return value.
  
#### Storage

Storage should include an implementation of migration status storage engine. Migsi comes with a few built in
engines, and you can easily implement additional ones to fit your needs.

##### json-file

    { "storage": require('migsi/storage/json-file')("/path/filename.json") }
    
JSON-file storage stores the migration status on the disk, in a JSON file. The full path to the filename should be
provided to the function.

##### mongo

    { "storage": require('migsi/storage/mongo')(mongoConnectionURL) }
    { "storage": require('migsi/storage/mongo')(mongoConnectionURL, collectionName) }
    
This storage allows the migration status to be stored in a mongo database, which is especially useful when it serves
as the main subject of the migration scripts. By default the collection used is `migsimigrations`.

##### Custom

Creating custom storage implementation is simple. The storage needs to be an object with two methods:

- `updateStatus(migration)`, which is supposed to save the contents of the migration object (excluding its methods)
  into the storage. You could save the result of `JSON.stringify(migration)`, for example. A record with the matching
  `migsiName` field should be replaced, if no such record exists, a new record should be created.
  
- loadPastMigrations, which returns a promise that returns an array of the stored migration data  

## Creating migrations

Usually you'll want to create migrations using the `create` option of the command line tool, as it sets up a template
that should be helpful for getting to work on the migration itself as well as a suitable filename. You can also
just create a file with a filename ending in `.migsi.js` somewhere within the migration directory.

A migration script is a javascript module, which exports an object with some of the following properties.

### friendlyName

This is the name of the migration script as displayed to the user.

### inDevelopment

A script that is not yet ready to be run in production environments should have their `inProduction` set to true.
This has a number of effects:

- an inDevelopment script can be run again, if it changes; if set to false, they can not (unless the `allowRerunningAllMigrations`
  configuration variable is set to true)
- running migrations in production mode omits scripts still in development (unless the `failOnDevelopmentScriptsInProductionMode`
  configuration variable is set to true, in which case having such a script causes the migration to fail)
  
Normally scripts that have been run with inDevelopment set to false will not be run again. It is often preferable to create
another migration script instead, but if the script is still in development environments forcing new versions to be run with
the MIGSI_ALLOW_RERUNNING_ALL_MIGRATIONS environment variable may be helpful.

### version

A script that is still under development will be re-run if its version number changes.

In production migration scripts the version number has no effect unless the `allowRerunningAllMigrations`, in which case
changing the version number causes the script and all those depending on it to be re-run.

A special value of `hash` in as the version prompts migsi to calculate the hash of the migration file and use it
as the version identifier. Do be aware that this of course does not detect changes to its dependencies.

### dependencies

A migration script can depend on other migration scripts. This is defined as an array called dependencies. A dependency
refers to the filename of the script relative to the migration directory without the `.migsi.js` suffix.

The default template automatically includes a dependency to what is considered the last existing migration script.

### "Using"

Migration scripts can have code dependencies. Of course you can implement setting up these things on your own, but
if you for example have multiple scripts that could share a database connection it makes sense to do so -- and to also
automate shutting it down.

These dependencies are created with "using" array. This array can contain either references to using objects in the
configuration by their name, or using objects themselves.

The values returned by these objects are provided to the `run` method as its parameters, in the order specified
in the `using` array.

The using objects can be written in a few ways. Look into `examples/using` for a variety of examples on how they can be written.

### Run

Run is a function, which is meant to do the actual work of the migration script. If asyncronous, it is expected to
return a promise which is resolved when the migration is complete. In many cases the most straightforward way to
do this is by simply writing the migration as an async function.

The run method gets parameters from the code dependencies declared in the `using` array.

## Creating migration templates

Migration templates should be created in your code base in the template directory declared in the configuration file.

The templates should have either `.js` or `.template.js` suffix in their filenames, although the suffix is not used 
when referring to them.

Your templates can override templates supplied with migsi; this is especially useful with the `default` template, which
allows you to have your own custom default template.

The templates can have a few variables set up by the migration creation.

- [[FRIENDLY_NAME]], which becomes the friendly name of the migration
- [[IMPLICIT_DEPENDENCY]], which becomes the name of the implicit dependency for the migration

A template can export `templateName` which is used as the name of the template when selecting a template in `migsi create`.

Any lines containing a `//` comment containing `migsi-template-exclude-line` are excluded from the migration scripts
created using the template. 

## Running migrations

### Command-line

    npm run migsi -- run # development
    npm run migsi -- run --production 
    
### API

    const migsi = require('migsi')

#### Configuring migsi
    
    // One of:
    migsi.configure() // automatically searches for the configuration file
    migsi.configure(filename) // loads the configuration from the given file
    migsi.configure(configurationObject) // uses the provided object for configuration

### Running migrations
    
    // And one of
    await migsi.runMigrations() // development
    await migsi.runMigrations({production: true) // production

You can also provide means to confirm running the migrations. This is done by adding they key `confirmation` to the
first parameter to `runMigrations`.

`confirmation` is a function, which is called with an array of new migrations before any of them are run. If it returns
a truthy value, the migrations are run. If the function returns a falsy value, the migration run is completed without 
running any of the scripts (but they will still be queried about the nexttime); if it throws, running the migrations 
throws. The function can return a promise that resolves to one of the specified values instead. If the call to 
`runMigrations` also includes a confirmation, then the second parameter to this function is its return value.    

    await migsi.runMigrations({confirmation: async migrations => requestConfirmationFromUser(migrations)})
    
    

    