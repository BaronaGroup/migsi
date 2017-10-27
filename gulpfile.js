const gulp = require('gulp'),
  ts = require('gulp-typescript'),
  es2017Project = ts.createProject('tsconfig.json', {target: 'es2017', rootDir: 'src'}),
  es2016Project = ts.createProject('tsconfig.json', {target: 'es2016', rootDir: 'src'}),
  testProject = ts.createProject('tsconfig.json', {target: 'es2017'})

gulp.task("es2017", function () {
  return es2017Project.src()
    .pipe(es2017Project())
    .pipe(gulp.dest("es2017"))
})

gulp.task("es2016", function () {
  return es2016Project.src()
    .pipe(es2016Project())
    .pipe(gulp.dest("es2016"))
})

gulp.task("build-tests", function () {
  return testProject.src()
    .pipe(testProject())
    .pipe(gulp.dest("test-build"))
})

gulp.task('default', ['es2016', 'es2017'])
