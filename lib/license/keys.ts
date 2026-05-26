/**
 * Artiline license verification public key (ECDSA P-256, SPKI PEM).
 *
 * The corresponding private key is held by Artiline and used only at the
 * license issuance endpoint in cloud edition. Self-host installations only
 * need the public key to verify signatures locally.
 *
 * For development/early launch, this is a placeholder. Before OSS launch we
 * generate a real keypair and replace this value. Existing licenses signed
 * with the dev key will need re-issuance on rotation.
 */
export const LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEPLACEHOLDERPLACEHOLDERPLACEHO
LDERPLACEHOLDERPLACEHOLDERPLACEHOLDERPLACEHOLDERPLACEHOLDER==
-----END PUBLIC KEY-----`;
