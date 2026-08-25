const crypto = require('crypto');

// Secret Key generation for AES-256-GCM (32 bytes)
const SECRET_SALT = 'mysql_tree_finder_secure_salt_2026';
const SECRET_PASSPHRASE = process.env.APP_SECRET || 'mysql_schema_finder_master_secret_key_987654321';
const KEY = crypto.scryptSync(SECRET_PASSPHRASE, SECRET_SALT, 32);

const ALGORITHM = 'aes-256-gcm';
const PREFIX = 'enc:v1:';

/**
 * Encrypts a plain text password using AES-256-GCM.
 * @param {string} text Plain text password
 * @returns {string} Encrypted string format: enc:v1:<iv>:<authTag>:<ciphertext>
 */
function encryptPassword(text) {
  if (!text || typeof text !== 'string') return '';
  // If already encrypted, return as is
  if (text.startsWith(PREFIX)) return text;

  try {
    const iv = crypto.randomBytes(12); // Recommended 12 bytes IV for GCM
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    const ivHex = iv.toString('hex');

    return `${PREFIX}${ivHex}:${authTag}:${encrypted}`;
  } catch (err) {
    console.error('Password encryption error:', err.message);
    return text;
  }
}

/**
 * Decrypts an encrypted password string.
 * @param {string} encryptedText Format: enc:v1:<iv>:<authTag>:<ciphertext>
 * @returns {string} Decrypted plain text password
 */
function decryptPassword(encryptedText) {
  if (!encryptedText || typeof encryptedText !== 'string') return '';
  if (!encryptedText.startsWith(PREFIX)) {
    // Return legacy plaintext password as is
    return encryptedText;
  }

  try {
    const payload = encryptedText.slice(PREFIX.length);
    const parts = payload.split(':');
    if (parts.length !== 3) return encryptedText;

    const [ivHex, authTagHex, cipherHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (err) {
    console.error('Password decryption error:', err.message);
    return '';
  }
}

module.exports = {
  encryptPassword,
  decryptPassword
};
