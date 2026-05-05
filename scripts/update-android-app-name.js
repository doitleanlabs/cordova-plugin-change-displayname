#!/usr/bin/env node

var fs = require('fs');
var path = require('path');
var xml2js = require('xml2js');

var parser = new xml2js.Parser();
var builder = new xml2js.Builder({
    xmldec: {
        version: '1.0',
        encoding: 'UTF-8'
    }
});

module.exports = function (context) {
    if (context.opts.platforms.indexOf('android') === -1) return;

    console.log('Attempting to set app name for android');

    var projectRoot = context.opts.projectRoot;
    var androidPlatformPath = path.join(projectRoot, 'platforms', 'android');

    if (!fs.existsSync(androidPlatformPath)) {
        console.warn('Android platform folder not found yet. Skipping app name update.');
        return;
    }

    var configPath = firstExistingPath([
        path.join(androidPlatformPath, 'app', 'src', 'main', 'res', 'xml', 'config.xml'),
        path.join(androidPlatformPath, 'res', 'xml', 'config.xml'),
        path.join(projectRoot, 'config.xml')
    ]);

    if (!configPath) {
        console.warn('Could not find a config.xml file to read AppName preference. Skipping update.');
        return;
    }

    var name = getPreferenceFromConfig(configPath, 'AppName');

    if (!name) {
        console.log('AppName preference not found in config. Skipping app name update.');
        return;
    }

    var stringsPath = firstExistingPath([
        path.join(androidPlatformPath, 'app', 'src', 'main', 'res', 'values', 'strings.xml'),
        path.join(androidPlatformPath, 'res', 'values', 'strings.xml')
    ]);

    if (!stringsPath) {
        console.warn('Could not find Android strings.xml. Skipping app name update.');
        return;
    }

    try {
        var stringsXml = fs.readFileSync(stringsPath, 'UTF-8');

        parser.parseString(stringsXml, function (err, data) {
            if (err || !data || !data.resources || !Array.isArray(data.resources.string)) {
                console.warn('Could not parse Android strings.xml. Skipping app name update.');
                return;
            }

            var updated = false;

            data.resources.string.forEach(function (stringNode) {
                if (stringNode.$ && stringNode.$.name === 'app_name') {
                    stringNode._ = name;
                    updated = true;
                }
            });

            if (!updated) {
                data.resources.string.push({
                    _: name,
                    $: { name: 'app_name' }
                });
            }

            console.log('Setting App Name:', name);
            fs.writeFileSync(stringsPath, builder.buildObject(data), 'UTF-8');
        });
    } catch (error) {
        console.warn('Failed to update Android app name:', error && error.message ? error.message : error);
    }
};

function firstExistingPath(candidates) {
    for (var i = 0; i < candidates.length; i++) {
        if (fs.existsSync(candidates[i])) {
            return candidates[i];
        }
    }

    return null;
}

function getPreferenceFromConfig(configPath, preferenceName) {
    try {
        var configXml = fs.readFileSync(configPath, 'UTF-8');
        var preferenceRegex = new RegExp("<preference\\s+name=['\\\"]" + escapeRegex(preferenceName) + "['\\\"]\\s+value=['\\\"]([^'\\\"]+)['\\\"]", 'i');
        var match = configXml.match(preferenceRegex);

        if (match && match[1]) {
            return match[1];
        }
    } catch (error) {
        console.warn('Failed to read config file for AppName preference:', error && error.message ? error.message : error);
    }

    return null;
}

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
