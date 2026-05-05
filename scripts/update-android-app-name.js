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

    var configCandidates = [
        path.join(androidPlatformPath, 'app', 'src', 'main', 'res', 'xml', 'config.xml'),
        path.join(androidPlatformPath, 'res', 'xml', 'config.xml'),
        path.join(projectRoot, 'config.xml')
    ];
    console.log('[ChangeDisplayName] config.xml candidates:', configCandidates.map(function(p) { return p + ' (' + (fs.existsSync(p) ? 'EXISTS' : 'missing') + ')'; }).join(', '));

    // Search ALL existing config.xml files for AppName (ODC injects into root, Cordova propagates to platform)
    var name = null;
    for (var i = 0; i < configCandidates.length; i++) {
        if (!fs.existsSync(configCandidates[i])) continue;
        // Log relevant lines so we can see exactly what's in the file
        try {
            var configContent = fs.readFileSync(configCandidates[i], 'UTF-8');
            var prefLines = configContent.split('\n').filter(function(l) { return /AppName|APP_NAME|widget|name=/i.test(l); }).slice(0, 5);
            console.log('[ChangeDisplayName] Relevant lines in', configCandidates[i] + ':', prefLines.join(' | '));
        } catch(e) { /* ignore */ }
        name = getPreferenceFromConfig(configCandidates[i], 'AppName') ||
               getPreferenceFromConfig(configCandidates[i], 'APP_NAME');
        if (name) {
            console.log('[ChangeDisplayName] AppName found in:', configCandidates[i], '->', name);
            break;
        }
    }
    // Last resort: widget name from first existing config.xml
    if (!name) {
        var firstConfig = firstExistingPath(configCandidates);
        if (firstConfig) name = getWidgetNameFromConfig(firstConfig);
        console.log('[ChangeDisplayName] AppName fallback widget name:', name);
    }

    if (!name) {
        console.log('[ChangeDisplayName] AppName not found in any config. Skipping app name update.');
        return;
    }

    var stringsCandidates = [
        path.join(androidPlatformPath, 'app', 'src', 'main', 'res', 'values', 'strings.xml'),
        path.join(androidPlatformPath, 'res', 'values', 'strings.xml')
    ];
    console.log('[ChangeDisplayName] strings.xml candidates:', stringsCandidates.map(function(p) { return p + ' (' + (fs.existsSync(p) ? 'EXISTS' : 'missing') + ')'; }).join(', '));

    // Use first existing, or default to the Cordova 12 expected path (create if needed)
    var stringsPath = firstExistingPath(stringsCandidates) || stringsCandidates[0];

    console.log('[ChangeDisplayName] Using strings.xml:', stringsPath);

    try {
        if (fs.existsSync(stringsPath)) {
            // File exists: parse, update app_name, write back
            var stringsXml = fs.readFileSync(stringsPath, 'UTF-8');
            parser.parseString(stringsXml, function (err, data) {
                if (err || !data || !data.resources) {
                    console.warn('[ChangeDisplayName] Could not parse Android strings.xml:', err && err.message);
                    return;
                }

                if (!Array.isArray(data.resources.string)) {
                    data.resources.string = [];
                }

                var updated = false;
                data.resources.string.forEach(function (stringNode) {
                    if (stringNode.$ && stringNode.$.name === 'app_name') {
                        stringNode._ = name;
                        updated = true;
                    }
                });

                if (!updated) {
                    data.resources.string.push({ _: name, $: { name: 'app_name' } });
                }

                console.log('[ChangeDisplayName] Setting App Name:', name);
                fs.writeFileSync(stringsPath, builder.buildObject(data), 'UTF-8');
            });
        } else {
            // File doesn't exist yet (MABS 12 — Gradle creates it later).
            // Build the structure directly and write, Gradle will merge the rest.
            console.log('[ChangeDisplayName] strings.xml not found — creating it at:', stringsPath);
            var dir = path.dirname(stringsPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            var data = { resources: { string: [{ _: name, $: { name: 'app_name' } }] } };
            console.log('[ChangeDisplayName] Setting App Name:', name);
            fs.writeFileSync(stringsPath, builder.buildObject(data), 'UTF-8');
        }
    } catch (error) {
        console.warn('[ChangeDisplayName] Failed to update Android app name:', error && error.message ? error.message : error);
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
        var preferenceRegex = new RegExp("<preference\\s+name=['\\\"]" + escapeRegex(preferenceName) + "['\\\"]\\s+value=['\\\"]([^'\\\"]*)['\\\"]", 'i');
        var match = configXml.match(preferenceRegex);

        if (match && typeof match[1] === 'string') {
            return normalizePreferenceValue(match[1]);
        }
    } catch (error) {
        console.warn('Failed to read config file for AppName preference:', error && error.message ? error.message : error);
    }

    return null;
}

function getWidgetNameFromConfig(configPath) {
    try {
        var configXml = fs.readFileSync(configPath, 'UTF-8');
        var nameMatch = configXml.match(/<name>([^<]+)<\/name>/i);

        if (nameMatch && typeof nameMatch[1] === 'string') {
            return normalizePreferenceValue(nameMatch[1]);
        }
    } catch (error) {
        console.warn('Failed to read config file widget name:', error && error.message ? error.message : error);
    }

    return null;
}

function normalizePreferenceValue(value) {
    var normalized = String(value).trim();

    if (!normalized) return null;
    if (/^\$[A-Z0-9_]+$/i.test(normalized)) return null;

    return normalized;
}

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
