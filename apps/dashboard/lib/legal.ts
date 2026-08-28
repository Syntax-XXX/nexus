export interface LegalOperator {
  readonly name: string;
  readonly street: string;
  readonly postalCode: string;
  readonly city: string;
  readonly country: string;
  readonly email: string;
  readonly privacyEmail: string;
  readonly representative?: string;
  readonly dataProtectionOfficer?: string;
  readonly configured: boolean;
  readonly missing: readonly string[];
}

function value(name: string, fallback: string, missing: string[]): string {
  const value = process.env[name]?.trim();
  if (!value) missing.push(name);
  return value || fallback;
}

export function getLegalOperator(): LegalOperator {
  const missing: string[] = [];
  const email = value("LEGAL_CONTACT_EMAIL", "legal@example.invalid", missing);
  return {
    name: value("LEGAL_CONTROLLER_NAME", "Betreiber von Nexus (Konfiguration erforderlich)", missing),
    street: value("LEGAL_CONTROLLER_STREET", "Adresse noch nicht konfiguriert", missing),
    postalCode: value("LEGAL_CONTROLLER_POSTAL_CODE", "00000", missing),
    city: value("LEGAL_CONTROLLER_CITY", "Ort noch nicht konfiguriert", missing),
    country: value("LEGAL_CONTROLLER_COUNTRY", "Deutschland", missing),
    email,
    privacyEmail: process.env.LEGAL_PRIVACY_EMAIL?.trim() || email,
    configured: missing.length === 0,
    missing,
    ...(process.env.LEGAL_REPRESENTATIVE?.trim() ? { representative: process.env.LEGAL_REPRESENTATIVE.trim() } : {}),
    ...(process.env.LEGAL_DATA_PROTECTION_OFFICER?.trim() ? { dataProtectionOfficer: process.env.LEGAL_DATA_PROTECTION_OFFICER.trim() } : {}),
  };
}
