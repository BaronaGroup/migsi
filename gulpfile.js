const gulp = require("gulp")
const babel = require("gulp-babel")

gulp.task("default", function () {
  return gulp.src("src/**/*.js")
    .pipe(babel())
    .pipe(gulp.dest("node6"))
})
