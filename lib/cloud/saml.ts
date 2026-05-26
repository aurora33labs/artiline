import "server-only";
import {
  SAML,
  generateServiceProviderMetadata,
  ValidateInResponseTo,
} from "@node-saml/node-saml";
import type { SamlConfig } from "./sso";

/**
 * Thin wrapper over @node-saml/node-saml. SP-initiated SAML, HTTP-POST ACS.
 *
 * `endpoints` are derived per-request from the incoming host so the same code
 * serves the canonical app host and custom domains. The SP entityID is stable
 * per workspace (the metadata URL).
 */
export type SamlEndpoints = {
  /** Stable SP entityID, e.g. https://app.artiline.app/api/sso/<ws>/metadata */
  spEntityID: string;
  /** Assertion Consumer Service URL (our callback). */
  acsUrl: string;
};

function buildSaml(config: SamlConfig, ep: SamlEndpoints): SAML {
  return new SAML({
    // IdP
    entryPoint: config.ssoUrl,
    idpIssuer: config.entityID,
    idpCert: config.x509cert,
    // SP
    issuer: ep.spEntityID,
    callbackUrl: ep.acsUrl,
    audience: ep.spEntityID,
    // We do not sign AuthnRequests in v1 (no SP key); require signed assertions.
    wantAssertionsSigned: true,
    wantAuthnResponseSigned: false,
    // No shared request store yet; relax replay protection for v1.
    validateInResponseTo: ValidateInResponseTo.never,
    // Accept whatever NameID format the IdP emits (mock-saml, Okta, Azure...).
    identifierFormat: null,
  });
}

/** Build the redirect URL to the IdP for an SP-initiated login. */
export async function getLoginRedirectUrl(
  config: SamlConfig,
  ep: SamlEndpoints,
  relayState: string,
): Promise<string> {
  const saml = buildSaml(config, ep);
  return saml.getAuthorizeUrlAsync(relayState, undefined, {});
}

export type SamlIdentity = { email: string; name: string | null };

/**
 * Validate a base64 SAMLResponse from the ACS POST. Throws if the signature is
 * invalid or no email can be resolved. Returns the normalized identity.
 */
export async function validateResponse(
  config: SamlConfig,
  ep: SamlEndpoints,
  samlResponse: string,
): Promise<SamlIdentity> {
  const saml = buildSaml(config, ep);
  const { profile } = await saml.validatePostResponseAsync({
    SAMLResponse: samlResponse,
  });
  if (!profile) throw new Error("SAML_NO_PROFILE");

  const emailAttr = config.attributeMap.email;
  const nameAttr = config.attributeMap.name;

  const rawEmail =
    pickString(profile[emailAttr]) ??
    pickString(profile.email) ??
    pickString(profile.mail) ??
    (looksLikeEmail(profile.nameID) ? profile.nameID : null);

  if (!rawEmail) throw new Error("SAML_NO_EMAIL");
  const email = rawEmail.trim().toLowerCase();

  const name =
    (nameAttr ? pickString(profile[nameAttr]) : null) ??
    pickString(profile.displayName) ??
    null;

  return { email, name };
}

/** SP metadata XML for the customer to register in their IdP. */
export function spMetadata(ep: SamlEndpoints): string {
  return generateServiceProviderMetadata({
    issuer: ep.spEntityID,
    callbackUrl: ep.acsUrl,
    identifierFormat: null,
    wantAssertionsSigned: true,
  });
}

function pickString(v: unknown): string | null {
  if (typeof v === "string" && v.length > 0) return v;
  if (Array.isArray(v) && typeof v[0] === "string" && v[0].length > 0)
    return v[0];
  return null;
}

function looksLikeEmail(v: unknown): v is string {
  return typeof v === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
}
