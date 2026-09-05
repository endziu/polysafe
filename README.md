# PolySafe

Embed any file into an encrypted, self-decrypting HTML file.

## Features

* Encryption and decryption happen locally in the browser
* Encrypts arbitrary files (and their filename)
* Decryptor supports almost all browsers released 2015 or later

## Usage

### Encryption

1. Open a local or hosted copy of `polysafe.html` in your browser.
2. Select a file, enter and repeat a long, unique passphrase and click `Encrypt`.
3. Store the encrypted, self-decrypting HTML file that will be downloaded.
4. (Optional) Rename the HTML file if you want to keep the filename secret.

### Decryption

1. Open the generated HTML file in your browser.
2. Enter the password and click `Decrypt`.
3. The original file with its original filename will be downloaded.

## Browser support

### Decryptor

* Firefox 34+ (Dec 2014)
* Chrome 38+, tested: 46+ (Oct 2015)
* Opera 29+ (Apr 2015)
* Safari 10.1+ untested and Desktop-only

### Encryptor

* Any recent version of Firefox, Chrome, Opera or (Desktop) Safari

## Security considerations

PolySafe relies on the following algorithms offered natively by the WebCrypto API and running directly in the browser:

* Authenticated encryption: AES-GCM (128 bits with a cryptographically random IV)
* Key derivation: PBKDF2-HMAC-SHA256 (600,000 iterations with a cryptographically random salt)

New encryption rejects empty passwords. Passwords are used exactly as entered, including spaces; a local strength estimate is shown as red (low), orange (medium), or green (high) lights as you type. The estimate considers length, character variety, repetition, and a small set of common patterns. It is advisory and does not block nonempty passwords or guarantee resistance to guessing. No passwords are sent anywhere, and the indicator requires no external libraries.

The PBKDF2 settings use [OWASP password-storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#pbkdf2) as a hardening benchmark, rather than a browser performance requirement. Existing generated HTML files retain their embedded PBKDF2-HMAC-SHA1 decryptor (200,000 iterations) and remain decryptable, including files originally created with an empty password. To upgrade an existing file, decrypt it and encrypt it again with this version and a long, unique passphrase.

Combined with a high-entropy password, this algorithmic setup should be reasonably secure for most users and their data. However, not just because of the possibility of bugs and structural weaknesses in the implementation, **there can be no guarantee whatsoever for the confidentiality of the processed data**.

Note that PBKDF2 does **not** offer the same level of resistance against GPU- and ASIC-based attacks as more recent algorithms such as scrypt or Argon2. These algorithms are not supported by the WebCrypto API and would thus have made the implementation both more complex and much less efficient. Since "Never trust a random guy on GitHub" should come well before "Protect against dedicated adversaries with GPU clusters" in anyone's threat model, not supporting better key derivation algorithms is a trade-off I am willing to make.

Should the self-decrypting HTML file have passed outside of your control between creating it and decrypting it again (e.g. you sent it to yourself by email or uploaded it somewhere on the web), then you may want to verify that the file has not been tampered with. For example the file could have been modified in such a way that the password will be leaked.

## Validation

Run `node --test tests/polysafe.test.mjs` (Node.js 22 or newer). The tests execute the generator and generated decryptor with real WebCrypto and browser API stubs, checking password validation, binary roundtrips, wrong passwords, ciphertext tampering, and legacy compatibility.

Run `make build` before publishing. It synchronizes the application and CNAME into `dist/`, including `index.html` for the site root.

Run `make test` to execute the regression tests. Run `make clear` to remove the generated `dist/` files.

On 2026-09-05, headless Chromium 151 on Linux passed a browser form-validation check and an encryption/decryption roundtrip. The generator's PBKDF2 derivation took 56.7–58.0 ms across five runs after one warmup (median 57.0 ms). This is a local measurement, not a performance guarantee; Firefox, Safari, older browsers, and mobile devices were not benchmarked.

Legacy fixtures were generated from reviewed commit `1dbf794c2b91f7c5254c33a3a3266ddb2e65fdbe`. They contain only test bytes; their passwords are recorded in the test file.

## License

MIT
