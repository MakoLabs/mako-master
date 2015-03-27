(function () {
    var Manifesto, Validator, data, fs, jsonOnly, path, schema, schemas, v, debug;

    debug = require('debug-levels')('manifesto');

    path = require('path');

    fs = require('fs');

    shelljs = require('shelljs');

    Validator = require('jsonschema').Validator;

    v = new Validator();

    schemas = {
        routing: {
            id: '/Routing',
            type: 'object',
            required: true,
            properties: {
                domain: {
                    type: 'string',
                    required: true
                }
            }
        },
        opts: {
            id: '/Opts',
            type: 'object',
            required: true,
            properties: {
                setup: {
                    type: 'array',
                    items: {
                        type: 'string'
                    }
                },
                command: {
                    type: 'array',
                    required: true,
                    items: {
                        type: 'string'
                    }
                },
                commit: {
                    type: 'string',
                    required: true
                },
                env: {
                    type: 'object',
                    required: true
                }
            }
        },
        manifest: {
            id: '/Manifest',
            type: 'object',
            required: true,
            properties: {
                instances: {
                    type: 'string',
                    required: true
                },
                load: {
                    type: 'integer',
                    required: true
                },
                routing: {
                    $ref: '/Routing'
                },
                opts: {
                    $ref: '/Opts'
                }
            }
        }
    };

    for (schema in schemas) {
        data = schemas[schema];
        v.addSchema(schemas[schema], data.id);
    }

    Manifesto = function () {
        this.manifestDir = path.resolve(process.cwd(), 'manifest');
        return this;
    };

    jsonOnly = function (file) {
        if (path.extname(file) === '.json') {
            return true;
        }
        return false;
    };

    Manifesto.prototype.manifests = function (cb) {
        return fs.readdir(this.manifestDir, (function (_this) {
            return function (err, files) {
                var done, manifests;
                files = files.filter(jsonOnly);
                if (files.length === 0) {
                    return cb(null, []);
                }
                done = 0;
                manifests = [];
                return files.map(function (file) {
                    return fs.readFile(path.join(_this.manifestDir, file), function (err, contents) {
                        var e;
                        try {
                            manifests.push({
                                file: file,
                                manifest: JSON.parse(contents.toString())
                            });
                        } catch (_error) {
                            e = _error;
                            debug.error('invalid JSON in manifest directory', file);
                        }
                        done++;
                        if (done === files.length) {
                            return cb(null, manifests);
                        }
                    });
                });
            };
        })(this));
    };

    Manifesto.prototype.write = function (info, cb) {
        return fs.writeFile(path.join(this.manifestDir, info.file), JSON.stringify(info.manifest), cb);
    };

    Manifesto.prototype.remove = function(info, cb){
        shelljs.exec('rm -f ' + path.join(this.manifestDir, info.file), cb);
    }

    Manifesto.prototype.validate = function (manifest) {
        var errors;
        if (Object.keys(manifest).length === 0) {
            return new Error('No manifests provided');
        }
        errors = Object.keys(manifest).map(function (repo) {
            errors = v.validate(manifest[repo], '/Manifest').errors;
            if (errors.length === 0) {
                return null;
            }
            return errors;
        });
        errors = errors.filter(function (errors) {
            if (errors) {
                return true;
            }
        });
        if (errors.length === 0) {
            return null;
        }
        return errors;
    };

    module.exports = new Manifesto;

}).call(this);
