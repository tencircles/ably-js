"use strict";

var fs = require('fs');
var path = require('path');
var webpackConfig = require('./webpack.config');

module.exports = function (grunt) {

	grunt.loadNpmTasks('grunt-contrib-concat');
	grunt.loadNpmTasks('grunt-closure-tools');
	grunt.loadNpmTasks('grunt-bump');
	grunt.loadNpmTasks('grunt-webpack');

	var dirs = {
		common: 'common',
		browser: 'browser',
		fragments: 'browser/fragments',
		static: 'browser/static',
		dest: 'browser/static',
		compat: 'browser/compat',
		crypto_js: 'node_modules/crypto-js/src',
		tools_compiler: __dirname + '/node_modules/google-closure-compiler/compiler.jar'
	};

	function compilerSpec(src, dest) {
		return {
			src: src,
			dest: (dest || src.replace(/\.js/, '.min.js'))
		};
	}

  function execExternal(cmd) {
		return function() {
			var done = this.async();
			grunt.log.ok("Executing " + cmd);
			require('child_process').exec(cmd, function(err, stdout, stderr) {
				if (err) {
					grunt.fatal('Error executing "' + cmd + '": ' + stderr);
				}
				console.log(stdout)
				stderr && console.error(stderr)
				done();
			});
		};
	}

	var gruntConfig = {
		dirs: dirs,
		pkgVersion: grunt.file.readJSON('package.json').version,
		webpack: {
			config: webpackConfig
		}
	};

	gruntConfig['closureCompiler'] = {
		options: {
			compilerFile: dirs.tools_compiler,
			compilerOpts: {
				compilation_level: 'SIMPLE_OPTIMIZATIONS',
				/* By default, the compiler assumes you're using es6 and transpiles to
				 * es3, adding various (unnecessary and undesired) polyfills. Specify
				 * both in and out to es3 to avoid transpilation */
				language_in: 'ECMASCRIPT5',
				language_out: 'ECMASCRIPT5',
				strict_mode_input: true,
				checks_only: true,
				warning_level: 'QUIET'
			}
		},
		'ably.js': compilerSpec('<%= dirs.static %>/ably.js')
	};

	gruntConfig.bump = {
		options: {
			files: ['package.json', 'README.md'],
			globalReplace: true,
			commit: true,
			commitMessage: 'Regenerate and release version %VERSION%',
			commitFiles: [], // Add files manually as can't add new files with a commit flag
			createTag: true,
			tagName: '%VERSION%',
			tagMessage: 'Version %VERSION%',
			push: false,
			prereleaseName: 'beta'
		}
	};

	grunt.initConfig(gruntConfig);

	grunt.registerTask('checkGitSubmodules',
		'Check, if git submodules are properly installed', function (){
			var done = this.async();
			var pathToSubmodule = path.join(__dirname, 'spec', 'common', 'ably-common');
			fs.stat(pathToSubmodule, function (error, stats){
				if(error) {
					grunt.log.writeln('%s : while checking submodule path!', error.message);
					grunt.log.writeln('Probably, git submodule at %s are not initialized?', pathToSubmodule);
					grunt.log.writeln('Please, initialize it with `git submodule init & git submodule update`!');
					return done(false);
				}
				if(stats.isDirectory()) {
					grunt.log.writeln('Git submodule at %s is found!', pathToSubmodule);
					return done();
				}
				grunt.log.writeln('Git submodule at %s is not initialized!', pathToSubmodule);
				grunt.log.writeln('Please, initialize it with `git submodule init & git submodule update`!');
				return done(false);
			});
		});

	grunt.registerTask('build', [
		'checkGitSubmodules',
		'webpack'
	]);

	grunt.registerTask('check-closure-compiler', [
		'build',
		'closureCompiler:ably.js'
	]);

	grunt.registerTask('all', ['build', 'check-closure-compiler', 'requirejs']);

	grunt.loadTasks('spec/tasks');

	var browsers = grunt.option('browsers') || 'default';
	var optionsDescription = '\nOptions:\n  --browsers [browsers] e.g. Chrome,PhantomJS (Firefox is default)';

	grunt.registerTask('test',
		'Concat files and run the entire test suite (Jasmine with node & Karma in a browser)' + optionsDescription,
		['build', 'mocha', 'karma:' + browsers]
	);

	grunt.registerTask('test:karma',
		'Run the Karma test suite' + optionsDescription,
		['build', 'karma:' + browsers]
	);

	grunt.registerTask('test:karma:run',
		'Concat files and then run the Karma test runner.  Assumes a Karma server is running',
		['build', 'requirejs', 'karma:run']
	);

	grunt.registerTask('test:mocha',
		'Concat files and then run the Mocha specs\nOptions\n  --test [tests] e.g. --test test/rest/auth.js',
		['build', 'mocha']
	);

	grunt.registerTask('test:webserver',
		'Launch the Mocha test web server on http://localhost:3000/',
		['build', 'checkGitSubmodules', 'requirejs', 'mocha:webserver']
	);

	grunt.registerTask('release:refresh-pkgVersion',
		'Refreshes GruntConfig.pkgVersion', function() {
			grunt.config('pkgVersion', grunt.file.readJSON('package.json').version);
			grunt.log.ok('pkgVersion updated');
		}
  );

	grunt.registerTask('release:git-add-generated',
		'Adds generated files to the git staging area', function() {
			var done = this.async();
			var generatedFiles = [
				gruntConfig.dirs.common + '/lib/util/defaults.js',
				gruntConfig.dirs.fragments + '/license.js',
				'package.json',
				'package-lock.json',
				'README.md',
				'spec/support/browser_file_list.js'
			];
			var cmd = 'git add -A ' + generatedFiles.join(' ');
			grunt.log.ok("Executing " + cmd);

			require('child_process').exec(cmd, function(err, stdout, stderr) {
				if (err) {
					grunt.fatal('git add . -A failed with ' + stderr);
				}
				done();
			});
		}
	);

	grunt.registerTask('release:git-push',
		'Pushes to git', execExternal('git push origin main --follow-tags')
	);

	grunt.registerTask('release:ably-deploy',
		'Deploys to ably CDN, assuming infrastructure repo is in same dir as ably-js',
		function() {
			var infrastructurePath = '../infrastructure',
					maxTraverseDepth = 3,
					infrastructureFound;

			var infrastructureDirExists = function() {
				try {
					var fileStat = fs.statSync(infrastructurePath);
					if (fileStat.isDirectory()) {
						return true;
					}
				} catch (e) { /* does not exist */ }
			}

			while (infrastructurePath.length < 'infrastructure'.length + maxTraverseDepth*3) {
				if (infrastructureFound = infrastructureDirExists(infrastructurePath)) {
					break;
				} else {
					infrastructurePath = "../" + infrastructurePath;
				}
			}
			if (!infrastructureFound) {
				grunt.fatal('Infrastructure repo could not be found in any parent folders up to a folder depth of ' + maxTraverseDepth);
			}
			var version = grunt.file.readJSON('package.json').version,
					cmd = 'cd ' + infrastructurePath + '; bundle exec ./bin/ably-env deploy javascript --version ' + version;
			console.log('Publishing version ' + version + ' of the library to the CDN');
			execExternal(cmd).call(this);
		}
	);

	grunt.registerTask('release:deploy',
		'Pushes a new release to github and then deploys to the Ably CDN',
		function() {
			grunt.task.run([
				'release:git-push',
				'release:ably-deploy'
			]);
		}
	);

	grunt.registerTask('release',
		'Increments the version, regenerates, and makes a tagged commit. Run as "grunt release:type", where "type" is "major", "minor", "patch", "prepatch", etc.)',
		function(versionType) {
			grunt.task.run([
				'bump-only:' + versionType,
				'release:refresh-pkgVersion',
				'all',
				'release:git-add-generated',
				'bump-commit']);
		}
	);

	grunt.registerTask('default', 'all');
};
