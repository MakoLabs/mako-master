(function () {
    var MASTER_PASS, Minion, getJSON, gitter, http, manifesto, model, respondJSONerr, server, url, util, debug, scheduler;

    debug = require('debug-levels')('webserver');

    http = require('http');

    url = require('url');

    model = require('../lib/model');

    gitter = require('../lib/gitter');

    Minion = require('../lib/minion');

    util = require('../lib/util');

    manifesto = require('../lib/manifesto');

    scheduler = require('./scheduler');

    server = http.createServer();

    MASTER_PASS = process.env.MASTER_PASS || "shortfin";

    getJSON = function (req, cb) {
        var optStr;
        optStr = "";
        req.on("data", function (buf) {
            return optStr += buf.toString();
        });
        return req.on("end", function () {
            var e, parsed;
            try {
                debug.verbose('processing', optStr);
                parsed = JSON.parse(optStr);
            } catch (_error) {
                e = _error;
                cb(e, null);
            }
            return cb(null, parsed);
        });
    };

    respondJSONerr = function (err, res) {
        res.writeHead(400);
        return respondJSON('error', err, res);
    };

    respondJSON = function (type,body,res){
        return res.end(JSON.stringify({type:type, body:body}));
    }

    server.on('request', function (req, res) {
        var authArray, name, parsed, minion, minions, _ref;
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Headers", req.headers["access-control-request-headers"]);
        if (req.method === 'OPTIONS') {
            return res.end();
        }
        if (req.headers.authorization == null) {
            res.setHeader('www-authenticate', 'Basic');
            res.writeHead(401);
            return res.end("auth required");
        }
        authArray = new Buffer(req.headers.authorization.split(' ')[1], 'base64').toString('ascii').split(':');
        if (authArray[1] !== MASTER_PASS) {
            res.writeHead(401);
            return res.end("wrong passphrase");
        }
        parsed = url.parse(req.url, true);

        debug.info('request', parsed.pathname);
        switch (parsed.pathname) {
            case "/health":
                return res.end("ok");
            case "/minions":
                res.setHeader("Content-Type", "application/json");
                minions = {};
                _ref = model.minions;
                for (name in _ref) {
                    minion = _ref[name];
                    minions[name] = {
                        ip: minion.ip,
                        processes: minion.processes,
                        load: minion.load,
                        spawnable: minion.spawnable,
                        apiVersion: minion.apiVersion
                    };
                }
                return res.end(JSON.stringify(minions));
            case "/manifest":
                res.setHeader("Content-Type", "application/json");
                return res.end(JSON.stringify(model.manifest));
            case "/manifestFile":
                return getJSON(req, function (err, manifestFile) {
                    var errs;
                    errs = manifesto.validate(manifestFile.manifest);
                    if (errs != null) {
                        return respondJSONerr(errs, res);
                    }
                    return manifesto.write(manifestFile, function (err) {
                        if (err != null) {
                            return respondJSONerr(err, res);
                        }
                        return res.end();
                    });
                });
            case "/manifestFile/remove":
                return getJSON(req, function (err, manifestFile) {
                    var errs;
                    errs = manifesto.validate(manifestFile.manifest);
                    if (errs != null) {
                        return respondJSONerr(errs, res);
                    }
                    return manifesto.remove(manifestFile, function (err) {
                        if (err != null) {
                            return respondJSONerr(err, res);
                        }
                        return res.end();
                    });
                });
            case "/stop":
                return getJSON(req, function (err, opts) {
                    if (err != null) {
                        return respondJSONerr(err, res);
                    }
                    return Minion.stop(opts.minion, opts.ids, function (err, body) {
                        return res.end();
                    });
                });
            case "/apiVersion":
                return res.end(util.apiVersion);

            case "/checkin":
                res.setHeader("Content-Type", "application/json");
                return getJSON(req, function (err, parsed) {
                    if (err != null) {
                        return respondJSONerr(err, res);
                    }

                    parsed.spawnable = true;
                    if (parsed.apiVersion !== util.apiVersion) {
                        parsed.spawnable = false;
                    }
                    if (model.minions[parsed.id] != null) {
                        clearTimeout(model.minions[parsed.id].timer);
                    } else {
                        debug.info('minion detected', parsed.id);
                    }
                    model.minions[parsed.id] = {
                        ip: req.connection.remoteAddress,
                        processes: parsed.processes,
                        spawnable: parsed.spawnable,
                        apiVersion: parsed.apiVersion,
                        load: scheduler.calcLoad(parsed.processes),
                        timer: setTimeout(function () {
                            delete model.minions[parsed.id];
                            debug.warn('minion timeout', parsed.id);
                            if ((model.portMap != null) && (model.portMap[parsed.id] != null)) {
                                debug.warn('delete portmap', JSON.stringify(model.portMap[parsed.id]));
                                return delete model.portMap[parsed.id];
                            }
                        }, model.ttl)
                    };
                    scheduler.updatePortMap(parsed.id, parsed.processes);
                    debug.verbose('hash compare', parsed.routingTableHash, model.currentRoutingTableHash);
                    if (parsed.routingTableHash !== model.currentRoutingTableHash) {
                        scheduler.calculateRoutingTable(function (err, table) {
                            if (err != null) {
                                debug.warn('connection', 'calculate table', err);
                                return respondJSONerr(err, res);
                            } else {
                                model.currentRoutingTableHash = util.hashObj(table);
                                return scheduler.propagateRoutingTable(table, function (err) {
                                    if (err != null) {
                                        debug.warn('connection', 'propagate table', err);
                                        return respondJSONerr(err, res);
                                    } else {
                                        return respondJSON('routing', table, res);
                                    }
                                })

                            }
                        });
                    } else {
                        return respondJSON('default', 'success', res);
                    }
                });
            case 'event':
                return getJSON(req, function (err, parsed) {
                    if (err != null) {
                        return respondJSONerr(err, res);
                    }
                    res.end(JSON.stringify({
                        minionId: parsed.id,
                        type: parsed.event,
                        info: parsed.info
                    }));
                });
            default:
                return gitter.handle(req, res);
        }
    });

    module.exports = server;

}).call(this);
