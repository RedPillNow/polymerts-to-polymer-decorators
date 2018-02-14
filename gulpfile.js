const gulp = require('gulp');
const merge = require('merge-stream');
const fs = require('fs');
const color = require('gulp-color');

/**
 * Determine the path to the dist directory
 * @param {string} subpath
 */
const path = require('path');
const DIST = 'dist';
const dist = (subpath) => {
	return !subpath ? DIST : path.join(DIST, subpath);
}

/**
 * Clean task
 * Delete everything but the security folder (for now)
 * @return {Promise}
 */
const del = require('del');
gulp.task('clean', () => {
	return del(['dist/', '*.log', '**/*.log']).then((paths) => {
		if (paths && paths.length > 0) {
			let items = paths.join('\n');
			console.log(color('Deleted ' + paths.length + ' distribution items:\n', 'MAGENTA'),  color(items, 'YELLOW'));
		} else {
			console.log(color('Nothing to delete!', 'GREEN'));
		}
	});
});

/**
 * Copy task
 * Copy all files/folders except .js and .ts files from src to dist
 */
gulp.task('copy', ['clean'], () => {
	return gulp.src(['src/**/*', '!src/*.{js,ts}', '!src/**/*.{js,ts}', '!src/test/'])
		.pipe(gulp.dest(dist()));
});

/**
 * Typescript task
 * Compile the typescript and distribute to the dist directory
 */
const ts = require('gulp-typescript');
const tsProject = ts.createProject('tsconfig.json');
const gulpIgnore = require('gulp-ignore');
const sourcemaps = require('gulp-sourcemaps');
gulp.task('typescript', ['copy'], () => {
	const tsResult = tsProject.src()
		.pipe(sourcemaps.init())
		.pipe(tsProject(ts.reporter.longReporter()));

	return merge([
		tsResult.dts.pipe(gulpIgnore.exclude(['src/test/**/*', 'node_modules']))
			.pipe(gulp.dest(dist())),
		tsResult.js.pipe(sourcemaps.write('.'))
			.pipe(gulp.dest(dist()))
	]);
});

/****** Production Build Tasks ******/
const bump = require('gulp-bump');
/**
 * Build:Major task
 * Bump the major version number (1.0.0) in package.json
 */
gulp.task('build:major', ['default'], function() {
	gulp.src(['./package.json'])
		.pipe(bump({type: 'major'}))
		.pipe(gulp.dest('./'));
});

/**
 * Build:Minor task
 * Bump the minor version number (0.1.0) in package.json
 */
gulp.task('build:minor', ['default'], function() {
	gulp.src(['./package.json'])
		.pipe(bump({type: 'minor'}))
		.pipe(gulp.dest('./'));
});

/**
 * Build:Patch task
 * Bump the patch version number (0.1.0) in package.json
 */
gulp.task('build:patch', ['default'], function() {
	gulp.src(['./package.json'])
		.pipe(bump())
		.pipe(gulp.dest('./'));
});

/**
 * Default task
 * Compile and copy all relevant files to the dist directory
 */
gulp.task('default', ['typescript']);
