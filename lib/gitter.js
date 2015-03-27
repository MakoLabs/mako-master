(function () {
    var Minion, host, model, os, path, port, pushover, repodir, repos, master_pass, debug;

    debug = require('debug-levels')('gitter');

    pushover = require('pushover');

    path = require('path');

    os = require('os');

    repodir = path.resolve(process.cwd(), 'repos');

    repos = pushover(repodir);

    model = require('../lib/model');

    Minion = require('../lib/minion');

    host = process.env.MASTER_HOST || os.hostname();

    port = process.env.WEBSERVERPORT || 4001;

    master_pass = process.env.MASTER_PASS || 'shortfin';

    repos.on('push', function (push) {
        var opts, minion, _results;
        push.accept();
        opts = {
            name: push.repo,
            commit: push.commit,
            url: "http://git:" + master_pass + "@" + host + ":" + port + "/" + push.repo
        };
        model.latestCommits.put(opts.name, opts.commit, function (err) {
            if (err != null) {
                throw err;
            }
        });
        if (model.manifest && (model.manifest[opts.name] != null)) {
            model.prevCommits.put(opts.name, model.manifest[opts.name].opts.commit);
        }
        _results = [];
        for (minion in model.minions) {
            _results.push((function (minion) {
                return Minion.fetch(minion, opts, function (err, body) {
                    if (err != null) {
                        debug.error(err);
                    }
                    if (body != null) {
                        return debug.error(err);
                    }
                });
            })(minion));
        }
        return _results;
    });

    module.exports = {
        handle: function (req, res) {
            return repos.handle(req, res);
        },
        repos: repos
    };

}).call(this);
