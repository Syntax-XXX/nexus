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
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be configured before publishing legal pages`);
  return value;
}

export function getLegalOperator(): LegalOperator {
  return {
    name: required("LEGAL_CONTROLLER_NAME"),
    street: required("LEGAL_CONTROLLER_STREET"),
    postalCode: required("LEGAL_CONTROLLER_POSTAL_CODE"),
    city: required("LEGAL_CONTROLLER_CITY"),
    country: required("LEGAL_CONTROLLER_COUNTRY"),
    email: required("LEGAL_CONTACT_EMAIL"),
    privacyEmail: process.env.LEGAL_PRIVACY_EMAIL?.trim() || required("LEGAL_CONTACT_EMAIL"),
    ...(process.env.LEGAL_REPRESENTATIVE?.trim() ? { representative: process.env.LEGAL_REPRESENTATIVE.trim() } : {}),
    ...(process.env.LEGAL_DATA_PROTECTION_OFFICER?.trim() ? { dataProtectionOfficer: process.env.LEGAL_DATA_PROTECTION_OFFICER.trim() } : {}),
  };
}
