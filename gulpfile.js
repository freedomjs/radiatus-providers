/**
 * Gulpfile for radiatus-providers
 *
 * Here are the common tasks used:
 * build
 * - Lint and compile
 * - (default Grunt task)
 * - This must be run before ANY karma task (because of connect:default)
 * demo
 *  - start a web server for seeing demos at
 *    http://localhost:8000/demo
 * test
 *  - Build, and run all unit tests on 
 *    node.js, Chrome, Firefox, and PhantomJS
 * debug
 *  - Same as test, except keeps the browsers open 
 *    and reruns tests on watched file changes.
 *  - Used to debug unit tests
 **/
process.env.NODE_ENV = "test";

var gulp = require("gulp");
var jshint = require("gulp-jshint");
var karma = require("gulp-karma");
var through = require("through");

gulp.task("lint", function() {
  return gulp.src([
      "app.js",
      "src/**/*.js",
      "demo/**/*.js"
    ]).pipe(jshint({ lookup: true }))
    .pipe(jshint.reporter("default"));
});

gulp.task("default", [ "lint" ]);
