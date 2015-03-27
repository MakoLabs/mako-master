(function () {
    var EventEmitter, Scheduler, Minion, fs, manifestDir, model, path, scheduler, util, debug, shelljs, repodir, async, os;

    os = require('os');

    debug = require('debug-levels')('scheduler');

    async = require('async');

    shelljs = require('shelljs');

    fs = require('fs');

    path = require('path');

    repodir = path.resolve(process.cwd(), 'repos');

    EventEmitter = require('events').EventEmitter;

    model = require('../lib/model');

    Minion = require('../lib/minion');

    util = require('../lib/util');

    manifestDir = path.resolve(process.cwd(), 'manifest');

    host = process.env.MASTER_HOST || os.hostname();

    port = process.env.WEBSERVERPORT || 4001;

    master_pass = process.env.MASTER_PASS || 'shortfin';

    Scheduler = function () {
        this.insertCommit = function (name, data, cb) {
            var _ref;
            if (((_ref = data.opts) != null ? _ref.commit : void 0) == null) {
                return cb(null, name, data);
            }
            if (data.opts.commit === 'LATEST') {
                return model.latestCommits.get(name, function (err, commit) {
                    if (err != null && err.name) {
                        if (err.name === 'NotFoundError') {
                            return cb(null, name, data);
                        } else {
                            return cb(err, name, data);
                        }
                    }
                    data.opts.commit = commit;
                    return cb(null, name, data);
                });
            } else {
                return cb(null, name, data);
            }
        };
        this.checkDuplicateName = function (name, data, manifest, cb) {
            var err;
            if (manifest[name] != null) {
                err = "" + name + " is duplicated";
            }
            return cb(err, name, data);
        };
        this.getManifest = function (cb) {
            var manifest;
            manifest = {};
            return fs.readdir(manifestDir, (function (_this) {
                return function (err, files) {
                    var emitter, errs, file, numFiles, numStanzas, parts, _i, _len, _results;
                    if ((err != null ? err.code : void 0) === 'ENOENT') {
                        debug.error("Manifest directory not found at:", process.cwd(), 'mkdir ./manifest');
                    }
                    if (err != null) {
                        throw err;
                    }
                    errs = null;
                    parts = 0;
                    if (files.length === 0) {
                        //return cb("No manifest files found");
                        return cb(null);
                    }
                    numStanzas = 0;
                    numFiles = 0;
                    emitter = new EventEmitter;
                    emitter.on('file', function (file) {
                        numFiles++;
                        return fs.readFile(path.join(manifestDir, file), function (err, data) {
                            var parsed;
                            numFiles--;
                            try {
                                parsed = JSON.parse(data);
                            } catch (_error) {
                                err = _error;
                                if (err != null) {
                                    emitter.emit('fileErr', {
                                        file: file,
                                        error: err
                                    });
                                }
                            }
                            return emitter.emit('parsedFile', parsed);
                        });
                    });
                    emitter.on('parsedFile', function (parsed) {
                        var data, name, _results;
                        if (parsed === void 0) {
                            return emitter.emit('stanzaComplete');
                        }
                        if (Object.keys(parsed).length === 0) {
                            return emitter.emit('stanzaComplete');
                        }
                        _results = [];
                        for (name in parsed) {
                            data = parsed[name];
                            numStanzas++;
                            _results.push(emitter.emit('stanza', {
                                name: name,
                                data: data
                            }));
                        }
                        return _results;
                    });
                    emitter.on('stanza', function (_arg) {
                        var data, name;
                        name = _arg.name, data = _arg.data;
                        return _this.insertCommit(name, data, function (err, name, data) {
                            if (err != null) {
                                throw err;
                            }
                            return _this.checkDuplicateName(name, data, manifest, function (err, name, data) {
                                if (err != null) {
                                    emitter.emit('duplicateErr', {
                                        err: err,
                                        name: name,
                                        data: data
                                    });
                                }
                                manifest[name] = data;
                                numStanzas--;
                                return emitter.emit('stanzaComplete');
                            });
                        });
                    });
                    emitter.on('fileErr', function (err) {
                        if (errs == null) {
                            errs = [];
                        }
                        return errs.push(err);
                    });
                    emitter.on('duplicateErr', function (_arg) {
                        var data, err, name;
                        err = _arg.err, name = _arg.name, data = _arg.data;
                        if (errs == null) {
                            errs = [];
                        }
                        return errs.push("" + name + " is duplicated");
                    });
                    emitter.on('stanzaComplete', function () {
                        var data, frozenManifest, item, newManifestHash, oldManifestHash;
                        if (numStanzas === 0 && numFiles === 0) {
                            if (model.manifest == null) {
                                model.manifest = {};
                            }
                            newManifestHash = util.hashObj(manifest);
                            oldManifestHash = util.hashObj(model.manifest);
                            if (newManifestHash !== oldManifestHash) {
                                for (item in manifest) {
                                    data = manifest[item];
                                    if (model.manifest[item]) {
                                        if (data.opts.commit !== model.manifest[item].opts.commit) {
                                            model.prevCommits.put(item, model.manifest[item].opts.commit);
                                        }
                                    }
                                }
                                frozenManifest = JSON.parse(JSON.stringify(model.manifest));
                                return _this.checkStale(manifest, function () {
                                    model.manifest = manifest;
                                    return cb(errs);
                                });
                            } else {
                                model.manifest = manifest;
                                return cb(errs);
                            }
                        }
                    });
                    _results = [];
                    for (_i = 0, _len = files.length; _i < _len; _i++) {
                        file = files[_i];
                        _results.push(emitter.emit('file', file));
                    }
                    return _results;
                };
            })(this));
        };
        this.ps = function (cb) {
            var errs, jobs, ps, minion, _results;
            ps = {};
            errs = [];
            jobs = 0;
            _results = [];
            for (minion in model.minions) {
                jobs++;
                _results.push((function (minion) {
                    return Minion.ps(minion, function (err, procs) {
                        if (err != null) {
                            errs.push(err);
                        }
                        ps[minion] = procs;
                        jobs--;
                        if (jobs === 0) {
                            return cb(errs, ps);
                        }
                    });
                })(minion));
            }
            return _results;
        };
        this.buildRequired = function (cb) {
            var pid, present, procData, repo, repoData, required, running, minion, minionData, _ref, _ref1, _ref2, _ref3, _ref4;
            _ref = model.manifest;
            for (repo in _ref) {
                repoData = _ref[repo];
                if (repoData.instances === '*') {
                    required = repoData.required = [];
                    _ref1 = model.minions;
                    for (minion in _ref1) {
                        minionData = _ref1[minion];
                        present = false;
                        _ref2 = minionData.processes;
                        for (pid in _ref2) {
                            procData = _ref2[pid];
                            if (procData.repo === repo && procData.status === 'running' && procData.commit === repoData.opts.commit) {
                                present = true;
                            }
                        }
                        if (!(present || !minionData.spawnable)) {
                            required.push(minion);
                        }
                    }
                } else {
                    running = 0;
                    _ref3 = model.minions;
                    for (minion in _ref3) {
                        minionData = _ref3[minion];
                        _ref4 = minionData.processes;
                        for (pid in _ref4) {
                            procData = _ref4[pid];
                            if (procData.repo === repo && procData.status === 'running' && procData.commit === repoData.opts.commit) {
                                running++;
                            }
                        }
                    }
                    repoData.delta = repoData.instances - running;
                }
            }
            return cb();
        };
        this.markHealthy = function (cb) {
            var repoData;

            if (!model.manifest) return cb(null);
            if (Object.keys(model.manifest).length === 0) {
                return cb(null);
            }


            async.each(Object.keys( model.manifest), function (repo, next) {
                repoData =  model.manifest[repo];
                if ((!repoData.required || repoData.required.length === 0) && (!repoData.delta || repoData.delta === 0)) {
                    (function (repo, repoData) {
                        model.serviceInfo.get(repo, function (err, info) {
                            if (info == null) {
                                info = {
                                    healthyCommits: {}
                                };

                            }

                            info.healthyCommits[repoData.opts.commit] = true;
                            model.serviceInfo.put(repo, info, function (err) {
                                if (err != null) {
                                    next(err);
                                } else {
                                    debug.verbose('markHealthy', repo,JSON.stringify(info));
                                    next();
                                }
                            });
                        });
                    })(repo, repoData);
                } else {
                    next();
                }
            }, function (err) {
                cb(err);
            });
        };
        this.sortMinions = function (minions) {
            var k, v;
            return ((function () {
                var _ref, _results;
                _ref = minions || model.minions;
                _results = [];
                for (k in _ref) {
                    v = _ref[k];
                    _results.push([k, v.load]);
                }
                return _results;
            })()).sort(function (a, b) {
                    return a[1] - b[1];
                }).map(function (n) {
                    return n[0];
                });
        };
        this.filterMinions = function (minions) {
            var filtered, name, minion;
            filtered = {};
            for (name in minions) {
                minion = minions[name];
                if (minion.spawnable) {
                    filtered[name] = minion;
                }
            }
            return filtered;
        };
        this.populateOptions = function (minion, opts, cb) {
            var checkDone, errs, required;
            opts = JSON.parse(JSON.stringify(opts));
            required = {};
            errs = null;
            if ((opts.env != null) && opts.env.PORT === "RANDOM_PORT") {
                required.port = true;
            }
            checkDone = function () {
                if (Object.keys(required).length === 0) {
                    return cb(errs, opts);
                }
            };
            checkDone();
            if (required.port) {
                return Minion.port(minion, function (err, res) {
                    if (err != null) {
                        if (errs == null) {
                            errs = [];
                        }
                        errs.push({
                            minion: minion,
                            err: err
                        });
                        return checkDone();
                    }
                    opts.env.PORT = res.port;
                    delete required.port;
                    return checkDone();
                });
            }
        };
        this.spawnMissing = (function (_this) {
            return function (cb) {
                var checkDone, errs, numProcs, procs, repo, repoData, minion, target, _fn, _i, _len, _ref, _ref1;
                if (!model.minions) return cb(null);
                if (Object.keys(model.minions).length === 0) {
                    //return cb(new Error("Send in the Cavalry! (no minions available)"));
                    return cb(null);
                }
                errs = null;
                procs = {};
                numProcs = 0;
                checkDone = function (err, info) {
                    var data, opts, pid, proc, minion;
                    minion = info.minion;
                    proc = info.proc;
                    opts = info.opts;
                    numProcs--;
                    if (err != null) {
                        if (errs == null) {
                            errs = [];
                        }
                        errs.push({
                            minion: minion,
                            err: err
                        });
                    } else {
                        for (pid in proc) {
                            data = proc[pid];
                            procs[pid] = data;
                        }
                    }
                };
                _ref = model.manifest;

                async.eachSeries(Object.keys(_ref), function (repo, next) {
                        repoData = _ref[repo];
                        repoData.opts.repo = repo;
                        if (repoData.required != null) {
                            numProcs += repoData.required.length;
                            _ref1 = repoData.required;
                            _fn = function (minion, next) {
                                model.minions[minion].load += repoData.load;
                                return _this.spawn(minion, repoData.opts, function (err, info) {
                                    //checkDone(err, info);
                                    next(err);
                                });
                            };

                            async.eachSeries(_ref1, function (minion, next) {
                                _fn(minion, next);
                            });
                        } else if (repoData.delta > 0) {
                            numProcs += repoData.delta;
                            async.whilst(function () {return repoData.delta > 0;}, function (next) {
                                target = _this.sortMinions(_this.filterMinions(model.minions))[0];
                                model.minions[target].load += repoData.load;
                                repoData.delta--;
                                (function (target) {
                                    return _this.spawn(target, repoData.opts, function (err, info) {
                                        //checkDone(err, info);
                                        next();
                                    });
                                })(target);
                            }, function (err) {
                            });
                        }
                    }, function (err) {
                        return cb(errs, procs);
                    }
                );

            };
        })(this);
        this.spawn = (function (_this) {
            return function (minion, opts, cb) {
                var localRepo = path.resolve(repodir, opts.repo + '.git');
                if (!shelljs.test('-d', localRepo)) {
                    return cb(new Error('missing repo, push required: ' + opts.repo), {
                        minion: minion,
                        proc: null,
                        opts: opts
                    });
                }

                if (shelljs.exec('git rev-parse --verify ' + opts.commit, {silent: true}).code !== 0) {
                    return cb(new Error('could not validate commit: ' + opts.commit), {
                        minion: minion,
                        proc: null,
                        opts: opts
                    });
                }

                var fetch_opts = {
                    name: opts.repo,
                    commit: opts.commit,
                    url: "http://git:" + master_pass + "@" + host + ":" + port + "/" + opts.repo
                }

                return Minion.fetch(minion, fetch_opts, function (err, res) {

                    if (err != null) {
                        return cb(err, {
                            minion: minion,
                            proc: null,
                            opts: opts
                        });
                    }

                    return _this.populateOptions(minion, opts, function (err, opts) {
                        if (err != null) {
                            return cb(err, {
                                minion: minion,
                                proc: null,
                                opts: opts
                            });
                        }
                        return Minion.spawn(minion, opts, function (err, res) {
                            return cb(err, {
                                minion: minion,
                                proc: res,
                                opts: opts
                            });
                        });
                    });

                });
            };
        })(this);
        this.updatePortMap = function (minion, processes) {
            var pid, proc, _base, _results;
            _results = [];
            for (pid in processes) {
                proc = processes[pid];
                if ((proc.opts.env != null) && (proc.opts.env.PORT != null)) {
                    if (model.portMap == null) {
                        model.portMap = {};
                    }
                    if ((_base = model.portMap)[minion] == null) {
                        _base[minion] = {};
                    }
                    _results.push(model.portMap[minion][pid] = {
                        repo: proc.repo,
                        port: proc.opts.env.PORT,
                        commit: proc.opts.commit
                    });
                } else {
                    _results.push(void 0);
                }
            }
            return _results;
        };
        this.decideHealthyCommit = function (service, cb) {
            return model.serviceInfo.get(service.repo, function (err, info) {
                var targetCommit;
                if (err != null) {
                    return cb(err, '');
                }
                if (info.healthyCommits[model.manifest[service.repo].opts.commit]) {
                    targetCommit = model.manifest[service.repo].opts.commit;
                    return cb(null, targetCommit);
                } else {
                    return model.prevCommits.get(service.repo, function (err, prevCommit) {
                        targetCommit = prevCommit;
                        return cb(null, targetCommit);
                    });
                }
            });
        };
        this.calculateRoutingTable = function (cb) {
            var checkDone, counter, name, pid, routes, service, minion, _ref, _results;
            if (model.manifest == null) {
                //return cb(new Error("manifest not ready"));
                //debug.warn('calculatingRoutngTable', 'manifest not found');
                return cb(new Error("manifest not found"), null);
            }
            routes = {};
            counter = 0;
            checkDone = function () {
                if (counter === 0) {
                    return cb(null, routes);
                }
            };
            if (model.portMap == null || Object.keys(model.portMap).length === 0) {
                return cb(null, routes);
            }
            _ref = model.portMap;
            _results = [];
            for (name in _ref) {
                minion = _ref[name];
                _results.push((function () {
                    var _results1;
                    _results1 = [];
                    for (pid in minion) {
                        service = minion[pid];
                        if (model.manifest[service.repo] == null) {
                            continue;
                        }
                        _results1.push((function (_this) {
                            return function (name, minion, pid, service) {
                                counter++;
                                return _this.decideHealthyCommit(service, function (err, targetCommit) {
                                    var k, v, _base, _name, _ref1;
                                    counter--;
                                    if (service.commit !== targetCommit) {
                                        return checkDone();
                                    }
                                    if (routes[_name = service.repo] == null) {
                                        routes[_name] = {};
                                    }
                                    _ref1 = model.manifest[service.repo].routing;
                                    for (k in _ref1) {
                                        v = _ref1[k];
                                        routes[service.repo][k] = v;
                                    }
                                    if ((_base = routes[service.repo]).routes == null) {
                                        _base.routes = [];
                                    }
                                    if (model.minions[name].processes[pid] == null) {
                                        return checkDone();
                                    }
                                    if (model.minions[name].processes[pid].status === 'running') {
                                        routes[service.repo].routes.push({
                                            host: model.minions[name].ip,
                                            port: service.port
                                        });
                                    }
                                    return checkDone();
                                });
                            };
                        })(this)(name, minion, pid, service));
                    }
                    return _results1;
                }).call(this));
            }
            return _results;
        };
        this.propagateRoutingTable = (function (_this) {
            return function (table, cb) {
                var errs, jobs, name, minion, _ref, _results;
                jobs = Object.keys(model.minions).length;
                errs = null;
                _ref = model.minions;
                _results = [];
                for (name in _ref) {
                    minion = _ref[name];
                    _results.push(Minion.sendRouting(name, table, function (err, body) {
                        jobs--;
                        if (err != null) {
                            if (errs == null) {
                                errs = [];
                            }
                            errs.push({
                                minion: name,
                                err: err
                            });
                        }
                        if (jobs === 0) {
                            return cb(errs);
                        }
                    }));
                }
                return _results;
            };
        })(this);
        this.calcLoad = function (processes) {
            var load, pid, proc;
            load = 0;
            for (pid in processes) {
                proc = processes[pid];
                if (!(proc.status === 'running')) {
                    continue;
                }
                if (model.manifest == null) {
                    continue;
                }
                if (model.manifest[proc.repo] == null) {
                    continue;
                }
                load += model.manifest[proc.repo].load;
            }
            return load;
        };
        this.checkStale = function (manifest, cb) {
            var data, kill, pid, proc, repo, minion, _ref, _ref1;
            if (cb == null) {
                cb = function () {
                };
            }
            if (Object.keys(manifest).length === 0) {
                return cb();
            }
            kill = function (minion, pid, proc) {
                return model.serviceInfo.get(proc.repo, function (err, info) {
                    if (err || !info) {
                        return;
                    }
                    if (!info.healthyCommits[manifest[proc.repo].opts.commit]) {
                        return;
                    }
                    if (model.kill && model.kill[minion] && (model.kill[minion][pid] != null)) {
                        return;
                    }
                    if (model.kill == null) {
                        model.kill = {};
                    }
                    if (model.kill[minion] == null) {
                        model.kill[minion] = {};
                    }
                    return model.kill[minion][pid] = setTimeout(function () {
                        return Minion.stop(minion, [pid], function (err) {
                            if (err != null) {
                                return debug.error("Error stopping pid " + pid + " on minion " + minion, err);
                            }
                        });
                    }, manifest[proc.repo].killTimeout || 300000);
                });
            };
            _ref = model.minions;
            for (minion in _ref) {
                data = _ref[minion];
                _ref1 = data.processes;
                for (pid in _ref1) {
                    proc = _ref1[pid];
                    repo = manifest[proc.repo];
                    if ((proc.commit !== repo.opts.commit) && repo.killable) {
                        kill(minion, pid, proc);
                    }
                }
            }
            return cb();
        };
        return this;
    };

    scheduler = new Scheduler();

    module.exports = scheduler;

}).call(this);
