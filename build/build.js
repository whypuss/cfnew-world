/**
 * build/build.js - Random Fingerprint Generator for cfnew-plus
 * 
 * This script randomizes route names, enum/constant names, header keys,
 * and WS path at build time to break fingerprint clustering by CF's automated systems.
 * 
 * ARTIFACT BOUNDARY:
 *   Commit:   worker.js, build.js, build/mappings.json
 *   Ignore:  plain.js (generated), .wrangler/, node_modules/
 * 
 * ROUTE_SEED_VERSION:
 *   每次想要 rotate all routes，遞增此值。
 *   同版本號，每次 build 結果一致（deterministic）。
 *   禁止使用 timestamp 作為 seed。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration
const ROUTE_SEED_VERSION = 1;
const PROJECT_NAME = 'cfnew-plus';
const PROJECT_SEED = `${PROJECT_NAME}-v${ROUTE_SEED_VERSION}`;
const PLAIN_JS_PATH = path.join(__dirname, '..', 'plain.js');
const OUTPUT_PATH = path.join(__dirname, '..', 'plain.js'); // Overwrite plain.js
const WORKER_JS_PATH = path.join(__dirname, '..', 'worker.js');
const MAPPINGS_PATH = path.join(__dirname, 'mappings.json');

// Character sets for random string generation
const ALPHANUMERIC = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const NUMBERS = '0123456789';

/**
 * Seeded PRNG — 保证同 ROUTE_SEED_VERSION 每次 build 結果完全一致
 * 不再使用 crypto.randomBytes（每次不同）
 */
function createSeededRng(seed) {
    let h = 0xdeadbeef;
    for (let i = 0; i < seed.length; i++) {
        h = Math.imul(h ^ seed.charCodeAt(i), 2654435761);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    h ^= h >>> 16;
    return function() {
        h ^= h >>> 16;
        h = Math.imul(h, 2246822519);
        h ^= h >>> 13;
        h = Math.imul(h, 3266489917);
        h ^= h >>> 16;
        return (h >>> 0) / 4294967296;
    };
}

const rng = createSeededRng(PROJECT_SEED);

/**
 * Seeded random integer in [0, max)
 */
function randInt(max) {
    return Math.floor(rng() * max);
}

/**
 * Generate a random string of specified length (deterministic per seed version)
 */
function randomString(length, charset = ALPHANUMERIC) {
    let result = '';
    for (let i = 0; i < length; i++) {
        result += charset[Math.floor(rng() * charset.length)];
    }
    return result;
}

/**
 * Generate a random route path (e.g., "/a7f", "/x2k")
 */
function randomRoute() {
    const length = 3 + randInt(3); // 3-5 chars
    return '/' + randomString(length, LOWERCASE);
}

/**
 * Generate a random constant name (2-6 chars)
 */
function randomConstant(maxLen = 6) {
    const length = 2 + randInt(maxLen - 2);
    return randomString(length, LOWERCASE);
}

/**
 * Generate a random header key
 */
function randomHeader() {
    const prefixes = ['x-', 'cf-', 'cfx-', 'x' + randomString(1, LOWERCASE) + '-'];
    const suffix = randomString(2, LOWERCASE);
    return prefixes[randInt(prefixes.length)] + suffix;
}

/**
 * Generate a random WebSocket path (keeping ?ed=2048 format)
 */
function randomWsPath() {
    const paths = ['/live', '/socket', '/connect', '/v2', '/ws', '/data', '/sync', '/stream'];
    return paths[randInt(paths.length)];
}

/**
 * Generate a random JSON key
 */
function randomJsonKey(type) {
    const options = {
        'ip': ['addr', 'node', 'a', 'ipaddr', 'host'],
        'port': ['p', 'pt', 'port', 'svc'],
        'region': ['r', 'loc', 'reg', 'area']
    };
    const choices = options[type] || [randomConstant(3)];
    return choices[randInt(choices.length)];
}

/**
 * Generate all random mappings
 */
/**
 * Generate a random cache-control value
 */
function randomCacheControl() {
    const options = [
        'public, max-age=3600',
        'private, max-age=1800',
        'no-cache, no-store',
        'public, max-age=7200',
        'private, max-age=600',
        'public, s-maxage=300'
    ];
    return options[randInt(options.length)];
}

/**
 * Generate a random fake header key (x-build, x-edge, x-runtime, server-timing variants)
 */
function randomFakeHeader() {
    const prefixes = ['x-build', 'x-edge', 'x-runtime', 'server-timing'];
    const prefix = prefixes[randInt(prefixes.length)];
    const suffix = randomString(3, LOWERCASE);
    return `${prefix}-${suffix}`;
}

/**
 * Generate all random mappings
 */
function generateMappings() {
    const mappings = {
        seedVersion: ROUTE_SEED_VERSION,
        projectSeed: PROJECT_SEED,
        routes: {},
        constants: {},
        headers: {},
        wsPath: {},
        jsonKeys: {},
        cacheControl: {},
        fakeHeaders: {},
        queryParams: {},
        routeAliases: {}
    };

    // Route mappings
    mappings.routes['/sub'] = randomRoute();
    mappings.routes['/api/config'] = '/' + randomString(3, LOWERCASE) + '/' + randomString(4, LOWERCASE);
    mappings.routes['/api/preferred-ips'] = '/' + randomString(3, LOWERCASE) + '/' + randomString(5, LOWERCASE);
    mappings.routes['/?ed=2048'] = randomWsPath() + '?ed=2048';

    // Route aliases pool — multiple aliases for /sub
    const subAliases = [];
    for (let i = 0; i < 3; i++) {
        subAliases.push(randomRoute());
    }
    mappings.routeAliases['/sub'] = subAliases;

    // Constant/Enum name mappings
    mappings.constants['vless'] = randomConstant(2);
    mappings.constants['trojan'] = randomConstant(2);
    mappings.constants['ws'] = randomConstant(2);
    mappings.constants['clash'] = randomConstant(2);
    mappings.constants['base64'] = randomConstant(3);
    mappings.constants['surge'] = randomConstant(2);
    mappings.constants['singbox'] = randomConstant(3);
    mappings.constants['quantumult'] = randomConstant(3);

    // Header key mappings
    mappings.headers['Content-Type'] = randomHeader();
    mappings.headers['X-Real-IP'] = randomHeader();
    mappings.headers['CF-Connecting-IP'] = randomHeader();

    // JSON key mappings
    mappings.jsonKeys['ip'] = randomJsonKey('ip');
    mappings.jsonKeys['port'] = randomJsonKey('port');
    mappings.jsonKeys['region'] = randomJsonKey('region');

    // Also map server -> random (for JSON response keys)
    mappings.jsonKeys['server'] = randomJsonKey('ip');

    // WS path base (without query)
    mappings.wsPath['/?ed=2048'] = randomWsPath() + '?ed=2048';

    // Cache-Control options (weighted toward longer cache)
    const cacheOptions = [
        { value: 'public, max-age=3600', weight: 3 },
        { value: 'private, max-age=1800', weight: 2 },
        { value: 'no-cache, no-store', weight: 1 },
        { value: 'public, max-age=7200', weight: 2 },
        { value: 'private, max-age=600', weight: 1 }
    ];
    // Weighted random selection
    const totalWeight = cacheOptions.reduce((sum, o) => sum + o.weight, 0);
    let rand = Math.floor(rng() * totalWeight);
    for (const opt of cacheOptions) {
        rand -= opt.weight;
        if (rand < 0) {
            mappings.cacheControl['default'] = opt.value;
            break;
        }
    }
    if (!mappings.cacheControl['default']) mappings.cacheControl['default'] = cacheOptions[0].value;

    // Fake headers (x-build, x-edge, x-runtime, server-timing)
    const fakeHeaderKeys = ['x-build', 'x-edge', 'x-runtime', 'server-timing'];
    for (const key of fakeHeaderKeys) {
        mappings.fakeHeaders[key] = randomFakeHeader();
    }

    // Query param aliases: target→?, token→?, wk→?
    mappings.queryParams['target'] = randomString(3, LOWERCASE);
    mappings.queryParams['token'] = randomString(4, LOWERCASE);
    mappings.queryParams['wk'] = randomString(3, LOWERCASE);

    return mappings;
}

/**
 * Patch worker.js with randomized routes:
 * 1. Update RANDOMIZED_ROUTES constant (line ~24)
 * 2. Update browser-side sub-path literal in terminalHtml (lines ~5217, ~5953)
 * 3. Update FAKE_RESPONSE_HEADERS constant
 * 4. Patch query param aliases (target, token, wk)
 */
function patchWorkerJs(mappings) {
    if (!fs.existsSync(WORKER_JS_PATH)) {
        console.warn(`  worker.js not found at ${WORKER_JS_PATH}, skipping`);
        return;
    }

    let workerSource = fs.readFileSync(WORKER_JS_PATH, 'utf8');
    const subPath = mappings.routes['/sub'];
    const configPath = mappings.routes['/api/config'];
    const preferredPath = mappings.routes['/api/preferred-ips'];
    const wsPath = mappings.routes['/?ed=2048'];
    const subAliases = mappings.routeAliases['/sub'] || [];

    // 1. Update RANDOMIZED_ROUTES constant in worker.js
    const rrPattern = /const RANDOMIZED_ROUTES = \{[^}]+\};/;
    const newRr = `const RANDOMIZED_ROUTES = { '/sub': '${subPath}', '/api/config': '${configPath}', '/api/preferred-ips': '${preferredPath}', '/?ed=2048': '${wsPath}' };`;
    workerSource = workerSource.replace(rrPattern, newRr);
    console.log(`  Updated RANDOMIZED_ROUTES constant`);

    // 1b. Update ROUTE_ALIASES pool in worker.js (if present) or add it after RANDOMIZED_ROUTES
    const fakeHdrKeys = Object.entries(mappings.fakeHeaders).map(([k, v]) => `'${k}': '${v}'`).join(', ');
    const newFakeHeaders = `const FAKE_RESPONSE_HEADERS = { ${fakeHdrKeys} };`;
    const fakeHdrPattern = /const FAKE_RESPONSE_HEADERS = \{[^}]+\};/;
    if (fakeHdrPattern.test(workerSource)) {
        workerSource = workerSource.replace(fakeHdrPattern, newFakeHeaders);
        console.log(`  Updated FAKE_RESPONSE_HEADERS constant`);
    } else {
        // Insert after RANDOMIZED_ROUTES line
        workerSource = workerSource.replace(
            /const RANDOMIZED_ROUTES = \{[^}]+\};\n/,
            `const RANDOMIZED_ROUTES = { '/sub': '${subPath}', '/api/config': '${configPath}', '/api/preferred-ips': '${preferredPath}', '/?ed=2048': '${wsPath}' };\n${newFakeHeaders}\n`
        );
        console.log(`  Inserted FAKE_RESPONSE_HEADERS constant`);
    }

    // 1c. Update ROUTE_ALIASES pool (multiple aliases for /sub)
    const routeAliasesPattern = /const ROUTE_ALIASES = \[[^\]]*\];/;
    const newRouteAliases = `const ROUTE_ALIASES = [${subAliases.map(a => `'${a}'`).join(', ')}];`;
    if (routeAliasesPattern.test(workerSource)) {
        workerSource = workerSource.replace(routeAliasesPattern, newRouteAliases);
        console.log(`  Updated ROUTE_ALIASES constant`);
    }

    // 1d. Update QUERY_PARAM_ALIASES (target, token, wk)
    const qpaPattern = /const QUERY_PARAM_ALIASES = \{[^}]+\};/;
    const newQpa = `const QUERY_PARAM_ALIASES = { 'target': '${mappings.queryParams['target']}', 'token': '${mappings.queryParams['token']}', 'wk': '${mappings.queryParams['wk']}' };`;
    if (qpaPattern.test(workerSource)) {
        workerSource = workerSource.replace(qpaPattern, newQpa);
        console.log(`  Updated QUERY_PARAM_ALIASES constant`);
    }

    // 2. Update browser-side hardcoded sub path (e.g. '/qktzh') in terminalHtml
    // Matches: currentUrl + '/qktzh'  or  currentUrl + "/qktzh"
    const oldSubLiteral = /(\+\s*)'\/qktzh'/g;
    workerSource = workerSource.replace(oldSubLiteral, `$1'${subPath}'`);
    console.log(`  Updated browser-side sub path literals`);

    fs.writeFileSync(WORKER_JS_PATH, workerSource, 'utf8');
    console.log(`  Patched worker.js`);
}

/**
 * Apply all replacements to the source code
 */
function applyReplacements(source, mappings) {
    let result = source;

    // 1. Replace route paths
    for (const [original, replacement] of Object.entries(mappings.routes)) {
        // Only replace as complete path segments
        const escapedOriginal = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedOriginal, 'g');
        result = result.replace(regex, replacement);
    }

    // 2. Replace constant/enum names (as string literals)
    for (const [original, replacement] of Object.entries(mappings.constants)) {
        // Replace 'original' as a string literal (quoted)
        const patterns = [
            new RegExp(`'${original}'`, 'g'),
            new RegExp(`"${original}"`, 'g'),
            new RegExp(`\`${original}\``, 'g')
        ];
        for (const pattern of patterns) {
            result = result.replace(pattern, `'${replacement}'`);
        }
        
        // Also replace protocol URLs like 'vless://' -> 'xx://'
        if (original === 'vless' || original === 'trojan') {
            const urlPattern = new RegExp(`'${original}://'`, 'g');
            result = result.replace(urlPattern, `'${replacement}://'`);
        }
    }

    // 3. Replace header keys
    for (const [original, replacement] of Object.entries(mappings.headers)) {
        // Match as object property key
        const patterns = [
            new RegExp(`'${original}'`, 'g'),
            new RegExp(`"${original}"`, 'g')
        ];
        for (const pattern of patterns) {
            result = result.replace(pattern, `'${replacement}'`);
        }
    }

    // 4. Replace JSON keys (property names in objects)
    for (const [original, replacement] of Object.entries(mappings.jsonKeys)) {
        // Replace property key format: "original": or 'original': or original:
        const patterns = [
            new RegExp(`"${original}":`, 'g'),
            new RegExp(`'${original}':`, 'g'),
            new RegExp(`${original}:`, 'g')
        ];
        for (const pattern of patterns) {
            result = result.replace(pattern, `"${replacement}":`);
        }
    }

    // 5. Replace WS path (/?ed=2048 pattern)
    for (const [original, replacement] of Object.entries(mappings.wsPath)) {
        const escapedOriginal = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedOriginal, 'g');
        result = result.replace(regex, replacement);
    }

    return result;
}

/**
 * Validate that the result doesn't have obvious syntax errors
 */
function validateOutput(source) {
    // Basic checks
    const issues = [];
    
    // Check for unbalanced braces
    const openBraces = (source.match(/{/g) || []).length;
    const closeBraces = (source.match(/}/g) || []).length;
    if (openBraces !== closeBraces) {
        issues.push(`Unbalanced braces: ${openBraces} open, ${closeBraces} close`);
    }
    
    // Check for unbalanced parentheses
    const openParens = (source.match(/\(/g) || []).length;
    const closeParens = (source.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
        issues.push(`Unbalanced parentheses: ${openParens} open, ${closeParens} close`);
    }
    
    // Check for common syntax error patterns
    if (source.includes("''") && !source.includes("'',")) {
        // Empty string followed by something that isn't a comma
    }
    
    return issues;
}

/**
 * Main build function
 */
function build() {
    console.log('🚀 Starting fingerprint randomization build...\n');

    // Read source file
    if (!fs.existsSync(PLAIN_JS_PATH)) {
        console.error(`❌ Source file not found: ${PLAIN_JS_PATH}`);
        process.exit(1);
    }

    const source = fs.readFileSync(PLAIN_JS_PATH, 'utf8');
    console.log(`📄 Read ${source.split('\n').length} lines from plain.js`);

    // Generate random mappings
    const mappings = generateMappings();
    console.log('\n📋 Generated random mappings:');
    console.log('   Routes:');
    for (const [k, v] of Object.entries(mappings.routes)) {
        console.log(`      ${k} → ${v}`);
    }
    console.log('   Constants:');
    for (const [k, v] of Object.entries(mappings.constants)) {
        console.log(`      ${k} → ${v}`);
    }
    console.log('   Headers:');
    for (const [k, v] of Object.entries(mappings.headers)) {
        console.log(`      ${k} → ${v}`);
    }
    console.log('   JSON Keys:');
    for (const [k, v] of Object.entries(mappings.jsonKeys)) {
        console.log(`      ${k} → ${v}`);
    }
    console.log('   Cache Control:');
    console.log(`      default → ${mappings.cacheControl['default']}`);
    console.log('   Fake Headers:');
    for (const [k, v] of Object.entries(mappings.fakeHeaders)) {
        console.log(`      ${k} → ${v}`);
    }
    console.log('   Query Params:');
    for (const [k, v] of Object.entries(mappings.queryParams)) {
        console.log(`      ${k} → ${v}`);
    }
    console.log('   Route Aliases (/sub):');
    for (const alias of (mappings.routeAliases['/sub'] || [])) {
        console.log(`      → ${alias}`);
    }

    // Apply replacements to plain.js
    const transformed = applyReplacements(source, mappings);
    console.log('\n  Applied replacements to plain.js');

    // Also patch worker.js with randomized routes
    patchWorkerJs(mappings);

    // Validate output
    const issues = validateOutput(transformed);
    if (issues.length > 0) {
        console.warn('\n⚠️  Potential issues detected:');
        issues.forEach(issue => console.warn(`   - ${issue}`));
    } else {
        console.log('✅ Output validation passed');
    }

    // Write transformed file
    fs.writeFileSync(OUTPUT_PATH, transformed, 'utf8');
    console.log(`\n💾 Wrote transformed plain.js`);

    // Write mappings file
    fs.writeFileSync(MAPPINGS_PATH, JSON.stringify(mappings, null, 2), 'utf8');
    console.log(`💾 Wrote mappings to ${MAPPINGS_PATH}`);

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 Build Summary');
    console.log('='.repeat(50));
    console.log(`   Source lines: ${source.split('\n').length}`);
    console.log(`   Output lines: ${transformed.split('\n').length}`);
    console.log(`   Routes randomized: ${Object.keys(mappings.routes).length}`);
    console.log(`   Constants randomized: ${Object.keys(mappings.constants).length}`);
    console.log(`   Headers randomized: ${Object.keys(mappings.headers).length}`);
    console.log(`   JSON keys randomized: ${Object.keys(mappings.jsonKeys).length}`);
    console.log('='.repeat(50));
    console.log('✅ Fingerprint randomization complete!');
    console.log('\n  Next steps:');
    console.log('     node build/build.js   # Re-run to regenerate routes');
    console.log('     git add -A && git commit && git push');
    console.log('     npx wrangler deploy\n');

    return mappings;
}

// Run build
if (require.main === module) {
    build();
}

module.exports = { generateMappings, applyReplacements, patchWorkerJs, validateOutput };
