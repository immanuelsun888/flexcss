/*
 * Build file for flexcss
 * @author David Heidrich (me@bowlingx.com)
 */

var gulp = require('gulp');

// Libraries
var concat = require('gulp-concat'),
    uglify = require('gulp-uglify'),
    imagemin = require('gulp-imagemin'),
    sourcemaps = require('gulp-sourcemaps'),
    jshint = require('gulp-jshint'),
    del = require('del'),
    mainBowerFiles = require('main-bower-files'),
    autoprefixer = require('gulp-autoprefixer'),
    es = require("event-stream"), gulpFilter = require('gulp-filter'),
    order = require('gulp-order'),
    connect = require('gulp-connect'), plumber = require('gulp-plumber'),
    gutil = require('gulp-util'), postcss  = require('gulp-postcss');

var sass = require('gulp-sass');

var paths = {
    scripts: ['scripts/**/*.js'],
    images: ['assets/img/**/*', 'themes/img/**/*'],
    fonts: 'assets/fonts/**/*',
    sassThemes: 'examples/**/*.scss',
    sassLib: 'assets/**/*.scss'
};

var onError = function (err) {
    gutil.beep();
    console.log(err);
    // continue:
    this.emit('end');
};

// cleans build directory
gulp.task('clean', function (cb) {
    del(['build'], cb);
});

gulp.task('scripts', ['clean'], function () {
    // Minify and copy all JavaScript (except vendor scripts)
    return gulp.src(paths.scripts)
        .pipe(plumber({
            errorHandler: onError
        }))
        .pipe(sourcemaps.init())
        .pipe(jshint())
        .pipe(jshint.reporter('default'))
        .pipe(concat('app.js'))
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest('build/js'));
});

// all scripts with vendor dependencies
gulp.task('scriptsWithDependencies', ['clean'], function () {
    gulp.start('compileScriptsWithDependencies');
});

gulp.task('compileScriptsWithDependencies', function(){
    var jsFilter = gulpFilter('*.js');
    var vendorFiles =
        gulp.src(mainBowerFiles())
        .pipe(jsFilter)
        .pipe(concat('vendor.js'));

    var appFiles = gulp.src(paths.scripts)
        .pipe(plumber({
            errorHandler: onError
        }))
        .pipe(jshint())
        .pipe(jshint.reporter('jshint-stylish'))
        .pipe(concat('flexcss.js'));

    return es.concat(vendorFiles, appFiles)
        .pipe(order([
            "vendor.js",
            "flexcss.js"
        ]))
        .pipe(sourcemaps.init())
        .pipe(concat('app.js'))
        .pipe(uglify())
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest('build/js'))
        .pipe(connect.reload());
});

// Copy all static images
gulp.task('images', ['clean'], function () {
    return gulp.start('imagesReload');
});

gulp.task('imagesReload', function () {
    return gulp.src(paths.images)
        // Pass in options to the task
        .pipe(imagemin({optimizationLevel: 5}))
        .pipe(gulp.dest('build/img'));
});

gulp.task('fonts', ['clean'], function(){
    return gulp.src(paths.fonts)
        .pipe(gulp.dest('build/fonts'));
});

gulp.task('sass', ['clean'], function () {
    return gulp.start('compileSass');
});

// we got a bug here with the sourcemaps: https://github.com/floridoo/gulp-sourcemaps/issues/60
gulp.task('compileSass', function () {
    var processors = [
        require('csswring')
    ];

    return gulp.src(paths.sassThemes)
        .pipe(plumber({
            errorHandler: onError
        }))
        .pipe(sourcemaps.init())
        .pipe(sass())
        .pipe(sourcemaps.write({includeContent: false}))
        .pipe(sourcemaps.init({loadMaps: true}))
        .pipe(autoprefixer({
            browsers: ['last 2 versions'],
            cascade: false
        }))
        .pipe(postcss(processors))
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest('build/css'));
});

// Rerun the task when a file changes
gulp.task('watch', function () {
    // scripts and images
    gulp.watch(paths.scripts, ['compileScriptsWithDependencies']);

    // sass
    gulp.watch(paths.sassThemes, ['compileSass']);
    gulp.watch(paths.sassLib, ['compileSass']);
    gulp.watch(paths.images, ['imagesReload']);

});

// webserver
gulp.task('webserver', function() {
    connect.server({
        port:5757,
        livereload: true
    });
});

// The default task (called when you run `gulp` from cli)
gulp.task('default', ['watch', 'fonts', 'images', 'sass', 'scriptsWithDependencies', 'webserver']);

// distribution task
gulp.task('dist', ['scripts', 'fonts', 'images', 'sass']);