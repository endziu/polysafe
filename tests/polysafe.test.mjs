import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { test } from 'node:test';

const source = readFileSync(new URL('../polysafe.html', import.meta.url), 'utf8');
const bytes = Uint8Array.of(0, 255, 47, 128, 10);
const filename = 'private-zażółć.bin';
const password = ' long unique test passphrase 🔐 ';

function page(html, secret = password, repeated = secret, options = {}) {
    function eventTarget(properties = {}) {
        const listeners = {};
        return Object.assign(properties, {
            addEventListener(type, callback) { (listeners[type] ||= []).push(callback); },
            dispatch(type) { for (const callback of listeners[type] || []) callback(); }
        });
    }
    const status = { textContent: '' };
    const button = { disabled: false, value: html.includes('id="data"') ? 'Decrypt file' : 'Encrypt file' };
    const form = eventTarget({ style: {} });
    const fields = {
        password: eventTarget({ value: secret }),
        'password-strength': { dataset: {} }, 'password-strength-label': { textContent: 'password strength', setAttribute(name, value) { this[name] = value; } }, password_repeated: eventTarget({ value: repeated }),
        'password-strength-status': { textContent: '' },
        'password-match-status': { textContent: '' },
        'password-match': { dataset: {} },
        'password-match-label': { textContent: 'passwords match', setAttribute(name, value) { this[name] = value; } },
        file: { files: [{ name: options.filename || filename }] },
        data: { textContent: html.match(/<script id="data"[^>]*>([\s\S]*?)<\/script>/)?.[1] }
    };
    const downloads = [];
    const derivations = [];
    const timerErrors = [];
    let reads = 0;
    const context = vm.createContext({
        TextEncoder, TextDecoder, Uint8Array, Blob, DOMException, atob,
        setTimeout: callback => setTimeout(() => {
            try { callback(); } catch (error) { timerErrors.push(error); }
        }, 0),
        window: eventTarget({ crypto: {
            getRandomValues: array => webcrypto.getRandomValues(array),
            subtle: new Proxy(webcrypto.subtle, {
                get(target, key) {
                    if (key === 'deriveKey') return (...args) => {
                        derivations.push(args[0]);
                        return target.deriveKey(...args);
                    };
                    return target[key].bind(target);
                }
            })
        }, ...options.window }),
        document: {
            getElementById: id => fields[id],
            querySelector: selector => ({
                '.status': status, 'input[type=submit]': button, form,
                'input[type=password]': fields.password, style: { textContent: '' }
            })[selector]
        },
        FileReader: class {
            readAsArrayBuffer() {
                reads++;
                this.result = (options.bytes || bytes).buffer;
                this.onload();
            }
        }
    });
    for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
        if (!match[1].includes('application/json')) vm.runInContext(match[2], context);
    }
    context.download = (...args) => downloads.push(args);
    return {
        context, status, button, fields, form, downloads, derivations, timerErrors, get reads() { return reads; },
        async run(name) {
            context[name]();
            const deadline = Date.now() + 10000;
            while (button.disabled && !timerErrors.length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
            assert.deepEqual(timerErrors, [], 'no exceptions escape timer callbacks');
            assert.ok(!button.disabled, 'operation completes');
        }
    };
}

async function artifact() {
    const encryptor = page(source);
    await encryptor.run('runEncrypt');
    assert.equal(encryptor.status.textContent, '');
    assert.equal(encryptor.downloads.length, 1);
    assert.equal(encryptor.derivations[0].iterations, 600000);
    assert.equal(encryptor.derivations[0].hash.name, 'SHA-256');
    return new TextDecoder().decode(encryptor.downloads[0][1]);
}

function assertRecovered(decryptor) {
    assert.equal(decryptor.status.textContent, '');
    assert.equal(decryptor.downloads.length, 1);
    assert.equal(decryptor.downloads[0][0].name, filename);
    assert.deepEqual(decryptor.downloads[0][0].content, bytes);
}

test('blank passwords are rejected before file reading or key derivation', async () => {
    const encryptor = page(source, '');
    await encryptor.run('runEncrypt');
    assert.match(encryptor.status.textContent, /enter.*passphrase/i);
    assert.equal(encryptor.reads, 0);
    assert.equal(encryptor.derivations.length, 0);
    assert.equal(encryptor.downloads.length, 0);
});

test('both encryption password inputs are required', () => {
    for (const id of ['password', 'password_repeated']) {
        assert.match(source.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))[0], /\brequired\b/);
    }
});

test('mismatched passwords are rejected before reading', async () => {
    const encryptor = page(source, password, 'different');
    await encryptor.run('runEncrypt');
    assert.match(encryptor.status.textContent, /Passwords must match/);
    assert.equal(encryptor.reads, 0);
    assert.equal(encryptor.downloads.length, 0);
});

test('new artifacts use stronger PBKDF2 and preserve filename and binary bytes', async () => {
    const html = await artifact();
    assert.ok(!html.includes(filename));
    assert.ok(!html.includes(password));
    const decryptor = page(html);
    await decryptor.run('runDecrypt');
    assertRecovered(decryptor);
    assert.equal(decryptor.derivations[0].iterations, 600000);
    assert.equal(decryptor.derivations[0].hash.name, 'SHA-256');
});

test('wrong passwords and modified ciphertext are rejected', async () => {
    const html = await artifact();
    const wrong = page(html, 'wrong');
    await wrong.run('runDecrypt');
    assert.match(wrong.status.textContent, /Wrong password or corrupted file/);
    assert.equal(wrong.downloads.length, 0);
    const tampered = html.replace(/("encrypted":")([A-Za-z0-9+/])/, (_, prefix, first) => prefix + (first === 'A' ? 'B' : 'A'));
    const corrupt = page(tampered);
    await corrupt.run('runDecrypt');
    assert.match(corrupt.status.textContent, /Wrong password or corrupted file/);
    assert.equal(corrupt.downloads.length, 0);
});

for (const [name, secret] of [['legacy-password', password], ['legacy-empty', '']]) {
    test(`${name} artifact still decrypts`, async () => {
        const decryptor = page(readFileSync(new URL(`fixtures/${name}.html`, import.meta.url), 'utf8'), secret);
        await decryptor.run('runDecrypt');
        assertRecovered(decryptor);
    });
}

test('strength estimates handle empty, weak, moderate, and long passwords', () => {
    const { context } = page(source);
    for (const value of ['', 'short', 'Password123!', 'aaaaaaaaaaaaaaaaaaaa', 'abcabcabcabcabcabc', '12345678901234567890']) {
        assert.equal(context.passwordStrength(value), value ? 'low' : 'empty', value);
    }
    assert.equal(context.passwordStrength('MapleRiver7'), 'medium');
    assert.equal(context.passwordStrength('cedar orbit velvet harbor'), 'high');
    assert.equal(context.passwordStrength('N8!rV2#pL9@xQ4$z'), 'high');
});

test('indicator updates and resets without changing password input', () => {
    const { context } = page(source);
    const input = context.document.getElementById('password');
    for (const [value, level] of [['short', 'low'], ['MapleRiver7', 'medium'], ['cedar orbit velvet harbor', 'high'], ['', 'empty']]) {
        input.value = value;
        context.updatePasswordStrength();
        assert.equal(context.document.getElementById('password-strength').dataset.level, level);
        assert.equal(input.value, value);
        assert.equal(context.document.getElementById('password-strength-label').textContent, 'password strength');
        assert.match(context.document.getElementById('password-strength-label')['aria-label'], new RegExp(level === 'empty' ? 'not entered' : level));
    }
});

function embeddedPayload(html, payload) {
    return html.replace(/(<script id="data"[^>]*>)[\s\S]*?(<\/script>)/, (_, open, close) => open + payload + close);
}

for (const [label, payload] of [
    ['invalid JSON', '{'],
    ['invalid base64', JSON.stringify({ salt: [1], iv: [1], encrypted: '!' })],
    ['null payload', 'null'],
    ['missing fields', '{}']
]) {
    test(`malformed payload recovers: ${label}`, async () => {
        const html = await artifact();
        const decryptor = page(embeddedPayload(html, payload));
        await decryptor.run('runDecrypt');
        assert.match(decryptor.status.textContent, /Decryption failed:/);
        assert.equal(decryptor.button.value, 'Decrypt file');
        assert.equal(decryptor.downloads.length, 0);
        decryptor.fields.data.textContent = html.match(/<script id="data"[^>]*>([\s\S]*?)<\/script>/)[1];
        await decryptor.run('runDecrypt');
        assertRecovered(decryptor);
    });
}
