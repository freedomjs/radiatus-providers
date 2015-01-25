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
var static = require("node-static");
var http = require("http");

gulp.task("lint", function() {
  return gulp.src([
      "app.js",
      "src/**/*.js",
      "demo/**/*.js"
    ]).pipe(jshint({ lookup: true }))
    .pipe(jshint.reporter("default"));
});

gulp.task("demo", function() {
  var fileserver = new static.Server("demo/");
  // Serve static files from demo/
  require("http").createServer(function(req, res) {
    req.addListener("end", function() {
      fileserver.serve(req, res);
    }).resume();
  }).listen(8000);
  // Start Radiatus Providers Server
  require("./index");
});

gulp.task("default", [ "lint" ]);
