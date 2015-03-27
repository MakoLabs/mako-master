(function () {
    var assert, fs, manifesto, mkdirp, model, path, request, rimraf, util, webserver, manifestFilename;

    assert = require('assert');

    request = require('request');

    mkdirp = require('mkdirp');

    rimraf = require('rimraf');

    fs = require('fs');

    path = require('path');

    manifesto = require('../lib/manifesto');

    webserver = require("../lib/webserver");

    model = require("../lib/model");

    util = require("../lib/util");

    model.ttl = 5;

    manifestFilename = Math.floor(Math.random() * (1 << 24)).toString(16) + '.json';

    describe("webserver", function () {
        before(function (done) {
            return webserver.listen(4001, function () {
                return done();
            });
        });
        after(function (done) {
            return webserver.close(function () {
                return done();
            });
        });
        it('should return a 401 if not authed', function (done) {
            return request.get("http://localhost:4001", function (err, res, body) {
                assert.equal(err, null);
                return done(assert.equal(res.statusCode, 401));
            });
        });
        it('should return a 401 on the wrong password', function (done) {
            return request.get("http://localhost:4001", function (err, res, body) {
                assert.equal(err, null);
                return done(assert.equal(res.statusCode, 401));
            }).auth("user", "wrongpass");
        });
        it('should return a 200 on the right password', function (done) {
            return request.get("http://localhost:4001/health", function (err, res, body) {
                assert.equal(err, null);
                return done(assert.equal(res.statusCode, 200));
            }).auth("user", "shortfin");
        });
        it('should return 404 on a null path', function (done) {
            return request.get("http://localhost:4001", function (err, res, body) {
                assert.equal(err, null);
                return done(assert.equal(res.statusCode, 404));
            }).auth("user", "shortfin");
        });
        it('should return a list of current minions', function (done) {
            model.minions = {
                minion1: {
                    ip: "127.0.0.1",
                    spawnable: true,
                    apiVersion: util.apiVersion,
                    processes: {
                        pid1: {
                            id: "pid1",
                            status: "running",
                            repo: "test1",
                            opts: {
                                commit: "1",
                                env: {
                                    PORT: 3008
                                }
                            }
                        }
                    }
                }
            };
            return request.get("http://localhost:4001/minions", function (err, res, body) {
                assert.deepEqual(JSON.parse(body), model.minions);
                return done();
            }).auth("user", "shortfin");
        });
        it('should return the manifest', function (done) {
            model.manifest = {
                a: {
                    instances: '*',
                    opts: {
                        commit: '1'
                    }
                }
            };
            return request.get("http://localhost:4001/manifest", function (err, res, body) {
                assert.deepEqual(JSON.parse(body), model.manifest);
                return done();
            }).auth("user", "shortfin");
        });
        it('should return permissive CORS headers', function (done) {
            return request.get("http://localhost:4001/minions", function (err, res, body) {
                assert.equal(res.headers['access-control-allow-origin'], '*');
                return done();
            }).auth("user", "shortfin");
        });
        it('should expose the api version', function (done) {
            return request.get("http://localhost:4001/apiVersion", function (err, res, body) {
                assert.equal(body, util.apiVersion);
                return done();
            }).auth("user", "shortfin");
        });
        return describe('manifest', function () {
            var rand, testFolder;
            rand = Math.floor(Math.random() * (1 << 24)).toString(16);
            testFolder = "./" + rand;
            beforeEach(function () {
                mkdirp.sync(testFolder);
                return manifesto.manifestDir = testFolder;
            });
            afterEach(function () {
                return rimraf.sync(testFolder);
            });
            it('should accept a new manifestFile', function (done) {
                var manifestFile;

                manifestFile = {
                    file: manifestFilename,
                    manifest: {
                        test1: {
                            instances: '1',
                            load: 1,
                            routing: {
                                domain: 'example.com'
                            },
                            opts: {
                                setup: ['npm', 'install', '--production'],
                                command: ['node', 'index.js'],
                                commit: 'LATEST',
                                env: {
                                    PORT: 'RANDOM_PORT'
                                }
                            }
                        }
                    }
                };
                return request({
                    uri: "http://localhost:4001/manifestFile",
                    json: manifestFile
                }, function (err, res, body) {
                    assert.equal(res.statusCode, 200);
                    assert(fs.existsSync(path.join(testFolder, manifestFile.file)));
                    return done();
                }).auth("user", "shortfin");
            });
            return it('should return a 400 if the manifest is invalid', function (done) {
                var manifestFile;
                manifestFile = {
                    file: Math.floor(Math.random() * (1 << 24)).toString(16) + '.json',
                    manifest: {
                        test1: {
                            instances: '1'
                        }
                    }
                };
                return request({
                    uri: "http://localhost:4001/manifestFile",
                    json: manifestFile
                }, function (err, res, body) {
                    assert.equal(res.statusCode, 400);
                    assert(!fs.existsSync(path.join(testFolder, manifestFile.file)));
                    return done();
                }).auth("user", "shortfin");
            });
            return it('should delete a new manifestFile', function (done) {
                var manifestFile;
                manifestFile = {
                    file: manifestFilename,
                    manifest: {
                        test1: {
                            instances: '1',
                            load: 1,
                            routing: {
                                domain: 'example.com'
                            },
                            opts: {
                                setup: ['npm', 'install', '--production'],
                                command: ['node', 'index.js'],
                                commit: 'LATEST',
                                env: {
                                    PORT: 'RANDOM_PORT'
                                }
                            }
                        }
                    }
                };
                return request({
                    uri: "http://localhost:4001/manifestFile/remove",
                    json: manifestFile
                }, function (err, res, body) {
                    assert.equal(res.statusCode, 200);
                    assert(!fs.existsSync(path.join(testFolder, manifestFile.file)));
                    return done();
                }).auth("user", "shortfin");
            });
        });
    });

}).call(this);
