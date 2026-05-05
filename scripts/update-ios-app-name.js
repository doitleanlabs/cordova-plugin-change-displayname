#!/usr/bin/env node

var fs   = require('fs');
var plist = require('plist');
var path = require('path');

module.exports = function (context) {
    if (context.opts.platforms.indexOf('ios') === -1) return;

    console.log('[ChangeDisplayName] Attempting to set app name for iOS');

    var projectRoot    = context.opts.projectRoot;
    var platformPath   = path.join(projectRoot, 'platforms', 'ios');

    if (!fs.existsSync(platformPath)) {
        console.warn('[ChangeDisplayName] iOS platform folder not found. Skipping.');
        return;
    }

    // Find the .xcodeproj to get the project name
    var xcodeProj;
    try {
        var files = fs.readdirSync(platformPath);
        xcodeProj = files.find(function (f) { return path.extname(f).toLowerCase() === '.xcodeproj'; });
    } catch (e) {
        console.warn('[ChangeDisplayName] Could not read iOS platform folder:', e.message);
        return;
    }

    if (!xcodeProj) {
        console.warn('[ChangeDisplayName] No .xcodeproj found in iOS platform. Skipping.');
        return;
    }

    var projectName = path.basename(xcodeProj, '.xcodeproj');

    // Find the config.xml to read AppName preference
    var configCandidates = [
        path.join(platformPath, projectName, 'config.xml'),
        path.join(platformPath, 'www', 'config.xml'),
        path.join(projectRoot, 'config.xml')
    ];
    console.log('[ChangeDisplayName] iOS config.xml candidates:', configCandidates.map(function (p) {
        return p + ' (' + (fs.existsSync(p) ? 'EXISTS' : 'missing') + ')';
    }).join(', '));

    var configPath = configCandidates.find(function (p) { return fs.existsSync(p); });

    if (!configPath) {
        console.warn('[ChangeDisplayName] Could not find config.xml. Skipping iOS app name update.');
        return;
    }

    var name = getPreferenceFromConfig(configPath, 'AppName') ||
               getPreferenceFromConfig(configPath, 'APP_NAME') ||
               getWidgetNameFromConfig(configPath);

    console.log('[ChangeDisplayName] iOS AppName resolved to:', name);

    if (!name) {
        console.log('[ChangeDisplayName] AppName preference not found. Skipping iOS app name update.');
        return;
    }

    var infoPlistPath = path.join(platformPath, projectName, projectName + '-Info.plist');
    if (!fs.existsSync(infoPlistPath)) {
        console.warn('[ChangeDisplayName] Info.plist not found at:', infoPlistPath, '. Skipping.');
        return;
    }

    try {
        var xml = fs.readFileSync(infoPlistPath, 'utf8');
        var obj = plist.parse(xml);
        obj.CFBundleDisplayName = name;
        fs.writeFileSync(infoPlistPath, plist.build(obj), { encoding: 'utf8' });
        console.log('[ChangeDisplayName] iOS app name set to:', name);
    } catch (e) {
        console.warn('[ChangeDisplayName] Failed to update iOS Info.plist:', e.message);
    }
};

function getPreferenceFromConfig(configPath, preferenceName) {
    try {
        var xml = fs.readFileSync(configPath, 'UTF-8');
        var re  = new RegExp("<preference\\s+name=['\"]" + escapeRegex(preferenceName) + "['\"]\\s+value=['\"]([^'\"]*)['\"]", 'i');
        var m   = xml.match(re);
        if (m && typeof m[1] === 'string') return normalizeValue(m[1]);
    } catch (e) {
        console.warn('[ChangeDisplayName] Failed to read config.xml for iOS:', e.message);
    }
    return null;
}

function getWidgetNameFromConfig(configPath) {
    try {
        var xml = fs.readFileSync(configPath, 'UTF-8');
        var m   = xml.match(/<name>([^<]+)<\/name>/i);
        if (m && typeof m[1] === 'string') return normalizeValue(m[1]);
    } catch (e) { /* ignore */ }
    return null;
}

function normalizeValue(value) {
    var v = String(value).trim();
    if (!v) return null;
    if (/^\$[A-Z0-9_]+$/i.test(v)) return null;
    return v;
}

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

