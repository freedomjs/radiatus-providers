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
if (!process.env.NODE_ENV) {
  // Default to test mode
  process.env.NODE_ENV = "test";
}

var gulp = require("gulp");
var jshint = require("gulp-jshint");
var karma = require("gulp-karma");
var fs = require("fs-extra");
var path = require("path");
var through = require("through");
var nodeStatic = require("node-static");
var http = require("http");
var browserify = require("browserify");
var source = require("vinyl-source-stream");
var buffer = require("vinyl-buffer");
var transform = require("vinyl-transform");
var uglify = require("gulp-uglify");
var sourcemaps = require("gulp-sourcemaps");
var runSequence = require("run-sequence");
var http = require("http");
var jasmine = require("gulp-jasmine");
var radiatusServer = require("./src/app");
var httpServer = null;

gulp.task("copy_manifests", function() {
  "use strict";
  var copyToDist = function(filepath) {
    fs.copy(
      filepath,
      "./dist/" + path.basename(filepath),
      function(err) { if (err) { throw err; } }
    );
  };
  copyToDist("./src/client/social.radiatus.json");
  copyToDist("./src/client/storage.radiatus.json");
  copyToDist("./src/client/storebuffer.radiatus.json");
  copyToDist("./src/client/transport.radiatus.json");
});

gulp.task("build_providers", function() {
  "use strict";
  var browserifyTarget = function(entry) {
    var filename = path.basename(entry);
    var bundler = browserify({
      entries: [ entry ],
      debug: true
    });
    var bundle = function() {
      return bundler
        .bundle()
        .pipe(source(filename))
        .pipe(buffer())
        .pipe(sourcemaps.init({ loadMaps: true }))
        // Add transformation tasks to the pipeline here.
        .pipe(uglify())
        .pipe(sourcemaps.write("./"))
        .pipe(gulp.dest("./dist/"));
    };
    return bundle();
  };

  browserifyTarget("./src/client/social.radiatus.js");
  browserifyTarget("./src/client/storage.radiatus.js");
  browserifyTarget("./src/client/transport.radiatus.js");
  return;
});

gulp.task("lint", function() {
  "use strict";
  return gulp.src([
      "*.js",
      "*.json",
      "src/**/*.js",
      "demo/**/*.js"
    ]).pipe(jshint({ lookup: true }))
    .pipe(jshint.reporter("default"))
    .pipe(jshint.reporter("fail"));
});

gulp.task("build_integration", function() {
  "use strict";
  // Browserify the integration test
  var browserified = transform(function(filename) {
    var b = browserify(filename);
    return b.bundle();
  });
  return gulp.src([ "spec/integration.spec.js" ])
    .pipe(browserified)
    .pipe(gulp.dest("./build/"));
});

gulp.task("start_server", function() {
  "use strict";
  // Start Radiatus Server
  radiatusServer.start();
  // Serve static files from demo/
  var fileserver = new nodeStatic.Server("./");
  httpServer = http.createServer(function(req, res) {
    req.addListener("end", function() {
      if (req.url === "/") {
        res.statusCode = "302";
        res.setHeader("Location", "/demo/index.html");
        res.end();
      } else {
        fileserver.serve(req, res);
      }
    }).resume();
  });
  httpServer.on("close", function() {
    // console.log("Static HTTP Server closed");
  });
  httpServer.listen(8000);
});

gulp.task("stop_server", function() {
  "use strict";
  // Stop Radiatus server
  radiatusServer.stop();
  // Stop static server
  httpServer.close();
});

var karma_task = function(action) {
  "use strict";
  return gulp.src([
    require.resolve("freedom"),
    "build/integration.spec.js"
  ]).pipe(karma({
    configFile: "karma.conf.js",
    action: action
  })).on("error", function(err) { 
    throw err; 
  });
};
gulp.task("karma_integration", [ "prep_integration" ], karma_task.bind(this, "run"));
gulp.task("karma_watch_integration", [ "prep_integration" ], karma_task.bind(this, "watch"));
gulp.task("node_integration", [ "prep_integration" ], function() {
  "use strict";
  return gulp.src("spec/integration.spec.js").pipe(jasmine({
    verbose: true
  }));
});

gulp.task("build", [ "lint", "copy_manifests", "build_providers" ]);
gulp.task("prep_integration", [ "build", "build_integration", "start_server" ]);
gulp.task("test", function() {
  "use strict"; // karma & node in parallel, stop_server afterwards
  runSequence([ "karma_integration", "node_integration" ], "stop_server" );
});
gulp.task("debug", [ "start_server", "karma_watch_integration" ]);
gulp.task("demo", [ "build", "start_server" ]);
gulp.task("default", [ "test" ]);

gulp.on("stop", function() {
  "use strict";
  // Process not exiting after successful test
  process.nextTick(function() {
    process.exit(0);
  });
});
