const gulp = require('gulp'),
  ts = require('gulp-typescript'),
  es2017Project = ts.createProject('tsconfig.json', {target: 'es2017', rootDir: 'src'}),
  es2016Project = ts.createProject('tsconfig.json', {target: 'es2016', rootDir: 'src'}),
  testProject = ts.createProject('tsconfig.json', {target: 'es2017'}),
  clean = require('gulp-clean')
  symlink = require('gulp-symlink')

gulp.task("es2017", ['es2017-clean'], function () {
  return es2017Project.src()
    .pipe(es2017Project())
    .pipe(gulp.dest("es2017"))
})

gulp.task("es2016", ['es2016-clean'], function () {
  return es2016Project.src()
    .pipe(es2016Project())
    .pipe(gulp.dest("es2016"))
})

gulp.task("build-tests", ['test-ts', 'test-symlink'])

gulp.task('test-symlink', ['test-clean'], function() {
  return gulp.src('templates')
    .pipe(symlink('test-build/templates'))
})

gulp.task("test-ts", ['test-clean'], function () {
  return testProject.src()
    .pipe(testProject())
    .pipe(gulp.dest("test-build"))
})

gulp.task('es2016-clean', function() {
  return gulp.src('es2016/*', {read: false})
    .pipe(clean())
})

gulp.task('es2017-clean', function() {
  return gulp.src('es2017/*', {read: false})
    .pipe(clean())
})

gulp.task('test-clean', function() {
  return gulp.src('test-build/*', {read: false})
    .pipe(clean())
})

gulp.task('clean', ['es2016-clean', 'es2017-clean', 'test-clean'])

gulp.task('default', ['es2016', 'es2017'])
