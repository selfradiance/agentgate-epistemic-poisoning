/**
 * Ed25519 request signing for AgentGate.
 * Self-contained — mirrors AgentGate's signing.ts so we don't import across projects.
 */

import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';

const ED25519_KEY_LENGTH = 32;

function toBase64Url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64(value: string): Buffer | null {
  try {
    return Buffer.from(value, 'base64');
  } catch {
    return null;
  }
}

function buildSignedMessage(
  nonce: string,
  method: string,
  path: string,
  timestamp: string,
  body: unknown,
): Buffer {
  return createHash('sha256')
    .update(`${nonce}${method}${path}${timestamp}${JSON.stringify(body)}`)
    .digest();
}

export function signRequest(
  publicKeyBase64: string,
  privateKeyBase64: string,
  nonce: string,
  method: string,
  path: string,
  timestamp: string,
  body: unknown,
): string {
  const publicKeyBytes = decodeBase64(publicKeyBase64);
  const privateKeyBytes = decodeBase64(privateKeyBase64);

  if (!publicKeyBytes || publicKeyBytes.length !== ED25519_KEY_LENGTH) {
    throw new Error('Invalid Ed25519 public key');
  }
  if (!privateKeyBytes || privateKeyBytes.length !== ED25519_KEY_LENGTH) {
    throw new Error('Invalid Ed25519 private key');
  }

  const privateKey = createPrivateKey({
    key: {
      kty: 'OKP',
      crv: 'Ed25519',
      x: toBase64Url(publicKeyBytes),
      d: toBase64Url(privateKeyBytes),
    },
    format: 'jwk',
  });

  const message = buildSignedMessage(nonce, method, path, timestamp, body);
  return sign(null, message, privateKey).toString('base64');
}

export function generateKeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = require('node:crypto').generateKeyPairSync('ed25519');
  const publicJwk = publicKey.export({ format: 'jwk' });
  const privateJwk = privateKey.export({ format: 'jwk' });

  if (!publicJwk.x || !privateJwk.d) {
    throw new Error('Failed to export Ed25519 keypair as JWK');
  }

  // Convert base64url to standard base64
  const pub = Buffer.from(publicJwk.x, 'base64url').toString('base64');
  const priv = Buffer.from(privateJwk.d, 'base64url').toString('base64');
  return { publicKey: pub, privateKey: priv };
}
