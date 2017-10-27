"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const fs = require("fs");
const cliColor = require("cli-color");
const _ = require("lodash");
const config_1 = require("./config");
const migration_loader_1 = require("./migration-loader");
const support_manager_1 = require("./support-manager");
const logger_1 = require("./logger");
const output_tracker_1 = require("./output-tracker");
exports.loadAllMigrations = async function () {
    return await migration_loader_1.findMigrations();
};
exports.filterMigrations = async function ({ name, since, until, failed }) {
    const migrations = await migration_loader_1.findMigrations();
    return migrations.filter(migration => {
        if (name && migration.friendlyName !== name && migration.migsiName !== name)
            return false;
        if (since && (!migration.hasBeenRun || asDate(migration.runDate) < since))
            return false;
        if (until && (!migration.hasBeenRun || asDate(migration.runDate) >= until))
            return false;
        if (failed && !migration.failedToRun)
            return false;
        return true;
    });
};
exports.createMigrationScript = async function (friendlyName, templateName = 'default') {
    const migPath = friendlyName.split('/');
    const plainName = _.last(migPath);
    const relativePath = migPath.slice(0, -1);
    const filename = (await getFilenamePrefix()) + toFilename(plainName) + '.migsi.js';
    const templateImpl = loadTemplate(templateName);
    const updatedTemplate = await updateTemplate(templateImpl, { friendlyName });
    const ffn = path.join(config_1.getDir("migrationDir"), ...relativePath, filename);
    if (fs.existsSync(ffn)) {
        throw new Error(ffn + 'already exists');
    }
    ensureDirExists(path.dirname(ffn));
    fs.writeFileSync(ffn, updatedTemplate, 'UTF-8');
    return ffn;
};
function ensureDirExists(path) {
    if (!fs.existsSync(path)) {
        ensureDirExists(getParent(path));
        fs.mkdirSync(path);
    }
    function getParent(path) {
        return path.split(/[/\\]/g).slice(0, -1).join(require('path').sep);
    }
}
async function getFilenamePrefix() {
    if (config_1.config.prefixAlgorithm)
        return await config_1.config.prefixAlgorithm();
    return getFilenameTimestamp() + '-';
}
function getFilenameTimestamp() {
    const now = new Date();
    return pad(now.getFullYear(), 4) + pad(now.getMonth() + 1) + pad(now.getDate()) + 'T' + pad(now.getHours()) + pad(now.getMinutes());
    function pad(input, to = 2) {
        const str = input.toString();
        if (str.length >= to)
            return str;
        return ('0000' + str).substr(-to);
    }
}
function toFilename(raw) {
    const invalidChars = /[^A-Za-z0-9-_]+/g;
    return raw.replace(invalidChars, '_');
}
function loadTemplate(template) {
    const templateFn = findTemplate(template);
    return fs.readFileSync(templateFn, 'UTF-8');
}
function findTemplate(templateName) {
    const templateDir = config_1.getDir("templateDir");
    const candidates = _.compact([
        templateDir && path.join(templateDir, templateName + '.template.js'),
        templateDir && path.join(templateDir, templateName + '.js'),
        path.join(__dirname, '..', 'templates', templateName + '.js')
    ]);
    for (let candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    throw new Error('Template not found: ' + templateName);
}
async function updateTemplate(rawTemplate, variables) {
    return rawTemplate.replace(/\[\[FRIENDLY_NAME\]\]/g, variables.friendlyName)
        .replace(/\[\[IMPLICIT_DEPENDENCY\]\]/g, await getImplicitDependencyName())
        .replace(/\n?.+\/\/.+migsi-template-exclude-line/g, '');
}
exports.runMigrations = async function ({ production, confirmation, dryRun = false } = {}) {
    if (!config_1.config.storage)
        throw new Error('No storage set up');
    let migrations = await exports.loadAllMigrations();
    if (production) {
        const firstNonProduction = migrations.find(migr => migr.inDevelopment);
        if (firstNonProduction) {
            const index = migrations.indexOf(firstNonProduction);
            const excluded = migrations.slice(index);
            const excludedDev = excluded.filter(mig => mig.inDevelopment);
            if (config_1.config.failOnDevelopmentScriptsInProductionMode) {
                throw new Error(`There are development scripts present for production usage; will not run any migrations.\n\nThe scrips marked for development are ${excludedDev.map(mig => mig.migsiName)}`);
            }
            migrations = migrations.slice(0, index);
            logger_1.default.log(`Excluding development mode migration scripts:\n${excludedDev.map(mig => mig.migsiName).join('\n')}`);
            const excludedProd = excluded.filter(mig => !mig.inDevelopment);
            logger_1.default.log(`Excluding production mode migration scripts dependant on development scripts:\n${excludedProd.map(mig => mig.migsiName).join('\n')}`);
        }
    }
    const toBeRun = migrations.filter(m => m.toBeRun);
    if (!toBeRun.length) {
        logger_1.default.log('No migrations to be run.');
        return;
    }
    logger_1.default.log(`Migrations to be run:\n${toBeRun.map(mig => mig.migsiName).join('\n')}`);
    if (!await confirmMigrations(toBeRun))
        return;
    const supportManager = new support_manager_1.default(toBeRun);
    let rollbackable = [];
    for (let migration of toBeRun) {
        const before = new Date();
        migration.output = {};
        try {
            logger_1.default.write(cliColor.xterm(33)('Running: '));
            logger_1.default.log(migration.migsiName);
            const supportObjs = await supportManager.prepare(migration);
            if (migration.rollback) {
                rollbackable.push(migration);
            }
            else {
                rollbackable = [];
            }
            if (!dryRun) {
                await output_tracker_1.trackOutput(migration, 'run', () => migration.run(...supportObjs));
            }
            const after = new Date(), durationMsec = after.valueOf() - before.valueOf();
            const duration = Math.floor(durationMsec / 100) / 10 + ' s';
            logger_1.default.write(cliColor.xterm(40)('Success: '));
            logger_1.default.log(migration.migsiName + ', duration ' + duration);
            migration.toBeRun = false;
            migration.hasBeenRun = true;
            migration.failedToRun = false;
            migration.rolledBack = false;
            migration.eligibleToRun = !!migration.inDevelopment;
            migration.runDate = new Date();
            if (!dryRun) {
                await config_1.config.storage.updateStatus(migration);
            }
            await supportManager.finish();
        }
        catch (err) {
            migration.failedToRun = true;
            migration.runDate = null;
            migration.hasBeenRun = false;
            migration.output.exception = exceptionToOutput(err);
            if (!dryRun) {
                await config_1.config.storage.updateStatus(migration);
            }
            await supportManager.destroy();
            logger_1.default.log(cliColor.xterm(9)('Failure: ' + migration.migsiName, err.stack || err));
            err.printed = true;
            if (!dryRun) {
                await rollback(rollbackable, toBeRun);
            }
            throw err;
        }
    }
    return toBeRun;
    async function rollback(rollbackable, toBeRun) {
        if (!config_1.config.storage)
            throw new Error('Storage not set up');
        if (!rollbackable.length) {
            logger_1.default.log('Rollback is not supported by the failed migration script.');
            return;
        }
        const rollbackAll = config_1.config.rollbackAll;
        if (rollbackAll && toBeRun[rollbackable.length - 1] !== rollbackable[rollbackable.length - 1]) {
            logger_1.default.warn('Not all run migration scripts support rollback; only rolling back the last ' + rollbackable.length + ' migration scripts');
        }
        const toRollback = rollbackAll ? _.reverse(rollbackable) : [_.last(rollbackable)];
        const supportManager = new support_manager_1.default(toRollback);
        for (let migration of toRollback) {
            const before = new Date();
            try {
                logger_1.default.write(cliColor.xterm(33)('Rolling back: '));
                logger_1.default.log(migration.migsiName);
                const supportObjs = await supportManager.prepare(migration);
                migration.toBeRun = true;
                migration.eligibleToRun = true;
                migration.rolledBack = true;
                migration.runDate = null;
                migration.hasBeenRun = false;
                if (migration.failedToRun)
                    await config_1.config.storage.updateStatus(migration);
                await output_tracker_1.trackOutput(migration, 'rollback', () => migration.rollback(...supportObjs));
                await config_1.config.storage.updateStatus(migration);
                const after = new Date(), durationMsec = after.valueOf() - before.valueOf();
                const duration = Math.floor(durationMsec / 100) / 10 + ' s';
                logger_1.default.write(cliColor.xterm(40)('Rollback success: '));
                logger_1.default.log(migration.migsiName + ', duration ' + duration);
                await supportManager.finish();
            }
            catch (err) {
                if (!migration.output)
                    migration.output = {};
                migration.output.rollbackException = exceptionToOutput(err);
                await config_1.config.storage.updateStatus(migration);
                await supportManager.destroy();
                logger_1.default.log(cliColor.xterm(9)('Failure to rollback: ' + migration.migsiName, err.stack || err));
                err.printed = true;
                throw err;
            }
        }
    }
    async function confirmMigrations(toBeRun) {
        let confirmResponse;
        if (confirmation) {
            if (!(confirmResponse = await confirmation(toBeRun))) {
                return false;
            }
        }
        if (config_1.config.confirmation) {
            if (!await config_1.config.confirmation(toBeRun, confirmResponse)) {
                return false;
            }
        }
        return true;
    }
};
function exceptionToOutput(err) {
    return {
        message: err.message,
        stack: (err.stack || '').toString()
    };
}
exports.createTemplate = async function (name) {
    const dir = config_1.getDir('templateDir');
    if (!dir)
        throw new Error('You do not have a templateDir in your config');
    const filename = path.join(dir, `${toFilename(name)}.template.js`);
    if (fs.existsSync(filename))
        throw new Error(filename + ' already exists');
    const defaultTemplateContents = fs.readFileSync(path.join(__dirname, '..', 'templates', 'default.js'), 'UTF-8');
    const newTemplateContents = defaultTemplateContents.replace(/\[\[TEMPLATE_NAME]]/g, name.replace(/'/g, "\\'"));
    fs.writeFileSync(filename, newTemplateContents, 'UTF-8');
    return filename;
};
async function getImplicitDependencyName() {
    const migrations = await migration_loader_1.findMigrations();
    if (!migrations.length)
        return '';
    return migrations[migrations.length - 1].migsiName;
}
exports.configure = function (configData) {
    if (typeof configData === 'string') {
        const configuration = require(configData);
        config_1.setupConfig(configuration.default || configuration);
    }
    else if (_.isObject(configData)) {
        config_1.setupConfig(configData);
    }
    else {
        config_1.findAndLoadConfig();
    }
};
function asDate(dateRepr) {
    if (!dateRepr)
        throw new Error('Internal error: date expected');
    if (dateRepr instanceof Date) {
        return dateRepr;
    }
    return new Date(dateRepr);
}
