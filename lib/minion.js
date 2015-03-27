(function () {
    var MINION_PORT, Minion, MINION_PASS, minion, model, parseJSON, request, util, debug;

    debug = require('debug-levels')('minion');

    model = require('../lib/model');

    util = require('../lib/util');

    request = require('request');

    MINION_PASS = process.env.MINION_PASS || "shortfin";

    MINION_PORT = parseInt(process.env.MINION_PORT);

    if (isNaN(MINION_PORT)) {
        MINION_PORT = 3000;
    }

    parseJSON = function (str) {
        var err;
        try {
            str = JSON.parse(str);
        } catch (_error) {
            err = _error;
        }
        return str;
    };

    Minion = function () {
        this.minionUrl = function (minion) {
            return "http://" + model.minions[minion].ip + ":" + MINION_PORT;
        };
        this.postJSON = function (arg, minion, opts, cb) {
            var url;
            url = "" + (this.minionUrl(minion)) + "/" + arg;
            debug.verbose('postJSON', url, opts);
            return request({
                json: opts,
                auth: {
                    user: "master",
                    pass: MINION_PASS
                },
                url: url
            }, function (error, response, body) {
                body = parseJSON(body);
                return cb(error, body);
            });
        };
        this.getJSON = function (arg, minion, cb) {
            var url;
            url = "" + (this.minionUrl(minion)) + "/" + arg;
            return request.get({
                url: url,
                auth: {
                    user: "master",
                    pass: MINION_PASS
                }
            }, function (error, response, body) {
                body = parseJSON(body);
                return cb(error, body);
            });
        };
        this.spawn = (function (_this) {
            return function (minion, opts, cb) {
                return _this.postJSON("" + util.apiVersion + "/spawn", minion, opts, cb);
            };
        })(this);
        this.exec = (function (_this) {
            return function (minion, opts, cb) {
                return _this.postJSON("" + util.apiVersion + "/exec", minion, opts, cb);
            };
        })(this);
        this.stop = (function (_this) {
            return function (minion, opts, cb) {
                return _this.postJSON("" + util.apiVersion + "/stop", minion, opts, cb);
            };
        })(this);
        this.restart = (function (_this) {
            return function (minion, opts, cb) {
                return _this.postJSON("" + util.apiVersion + "/restart", minion, opts, cb);
            };
        })(this);
        this.fetch = (function (_this) {
            return function (minion, opts, cb) {
                return _this.postJSON("fetch", minion, opts, cb);
            };
        })(this);
        this.port = (function (_this) {
            return function (minion, cb) {
                return _this.getJSON("port", minion, cb);
            };
        })(this);
        this.ps = function (minion, cb) {
            return this.getJSON("ps", minion, cb);
        };
        this.sendRouting = (function (_this) {
            return function (minion, table, cb) {
                return _this.postJSON("routingTable", minion, table, cb);
            };
        })(this);
        return this;
    };

    minion = new Minion();

    module.exports = minion;

}).call(this);
