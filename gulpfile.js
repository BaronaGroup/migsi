const gulp = require('gulp'),
  ts = require('gulp-typescript'),
  es2017Project = ts.createProject('tsconfig-lib.json', {target: 'es2017', rootDir: './src'}),
  es2016Project = ts.createProject('tsconfig-lib.json', {target: 'es2016', rootDir: 'src'}),
  testProject = ts.createProject('tsconfig.json', {target: 'es2017'}),
  gulpClean = require('gulp-clean'),
  symlink = require('gulp-symlink')

function buildES2017() {
  return es2017Project.src()
    .pipe(es2017Project())
    .pipe(gulp.dest("build/es2017"))
}
function buildES2016() {
  return es2016Project.src()
    .pipe(es2016Project())
    .pipe(gulp.dest("build/es2016"))
}

function testSymlink() {
  return gulp.src('templates')
    .pipe(symlink('build/test/templates'))
}

function buildTestSources() {
  return testProject.src()
    .pipe(testProject())
    .pipe(gulp.dest("build/test"))
}

function cleanES2016() {
  return gulp.src('build/es2016/*', {read: false})
    .pipe(gulpClean())
}

function cleanES2017() {
  return gulp.src('build/es2017/*', {read: false})
    .pipe(gulpClean())
}

function cleanTest() {
  return gulp.src('build/test/*', {read: false})
    .pipe(gulpClean())
}

const clean = gulp.parallel(cleanES2016, cleanES2017, cleanTest)
const buildTest = gulp.series(buildTestSources, testSymlink)
const justBuild = gulp.parallel(buildES2016, buildES2017, buildTest)

const build = gulp.series(clean, justBuild)
module.exports = {
  clean,
  default: build,
  build
}
