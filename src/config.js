"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const path = require("path");
exports.config = {};
exports.setupConfig = (newConfig) => {
    const existingConfigAny = exports.config;
    for (let key of Object.keys(exports.config)) {
        delete existingConfigAny[key];
    }
    Object.assign(exports.config, newConfig, getEnvironmentConfig());
};
exports.loadConfig = function (configPath) {
    const configObj = require(configPath);
    let actualConfigObj = configObj.default || configObj;
    if (!actualConfigObj.pathsRelativeTo)
        actualConfigObj.pathsRelativeTo = path.dirname(configPath);
    exports.setupConfig(actualConfigObj);
};
exports.findAndLoadConfig = function () {
    const configPath = findConfigPath();
    return exports.loadConfig(configPath);
};
exports.getDir = (configKey) => {
    const confDir = exports.config[configKey];
    if (!confDir)
        return undefined;
    if (path.isAbsolute(confDir)) {
        return confDir;
    }
    else {
        if (!exports.config.pathsRelativeTo)
            throw new Error('pathRelativeTo must be present if relative paths are used');
        return path.join(exports.config.pathsRelativeTo, confDir);
    }
};
function findConfigPath(from = __dirname) {
    let rcpath = from + '/.migsirc';
    if (fs.existsSync(rcpath)) {
        return rcpath;
    }
    const newPath = path.resolve(from, '..');
    if (newPath === '/')
        throw new Error('Could not find .migsirc');
    return findConfigPath(newPath);
}
function getEnvironmentConfig() {
    const additions = {};
    if (process.env.MIGSI_ALLOW_RERUNNING_ALL_MIGRATIONS) {
        additions.allowRerunningAllMigrations = true;
    }
    return additions;
}
