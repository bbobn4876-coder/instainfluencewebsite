export type MailProvider = {
  id: string;
  label: string;
  smtp: { host: string; port: number };
  imap: { host: string; port: number };
  /** Where the user gets the password to paste in. */
  passwordUrl?: string;
  /** Some providers authenticate with a fixed login instead of the address. */
  fixedUser?: string;
};

export const MAIL_PROVIDERS: MailProvider[] = [
  {
    id: "gmail",
    label: "Gmail",
    smtp: { host: "smtp.gmail.com", port: 587 },
    imap: { host: "imap.gmail.com", port: 993 },
    passwordUrl: "https://myaccount.google.com/apppasswords",
  },
  {
    id: "outlook",
    label: "Outlook",
    smtp: { host: "smtp-mail.outlook.com", port: 587 },
    imap: { host: "outlook.office365.com", port: 993 },
    passwordUrl: "https://account.microsoft.com/security",
  },
  {
    id: "yandex",
    label: "Yandex",
    smtp: { host: "smtp.yandex.ru", port: 465 },
    imap: { host: "imap.yandex.ru", port: 993 },
    passwordUrl: "https://id.yandex.ru/security/app-passwords",
  },
  {
    id: "mailru",
    label: "Mail.ru",
    smtp: { host: "smtp.mail.ru", port: 465 },
    imap: { host: "imap.mail.ru", port: 993 },
    passwordUrl: "https://account.mail.ru/user/2-step-auth/passwords",
  },
  {
    id: "zoho",
    label: "Zoho",
    smtp: { host: "smtp.zoho.com", port: 465 },
    imap: { host: "imap.zoho.com", port: 993 },
  },
  {
    id: "resend",
    label: "Resend",
    smtp: { host: "smtp.resend.com", port: 587 },
    imap: { host: "", port: 993 },
    fixedUser: "resend",
    passwordUrl: "https://resend.com/api-keys",
  },
  {
    id: "sendgrid",
    label: "SendGrid",
    smtp: { host: "smtp.sendgrid.net", port: 587 },
    imap: { host: "", port: 993 },
    fixedUser: "apikey",
    passwordUrl: "https://app.sendgrid.com/settings/api_keys",
  },
  {
    id: "custom",
    label: "Custom",
    smtp: { host: "", port: 587 },
    imap: { host: "", port: 993 },
  },
];

export function providerById(id: string): MailProvider | undefined {
  return MAIL_PROVIDERS.find((p) => p.id === id);
}

/** Guesses the provider from an address so the common case needs no picking. */
export function guessProvider(address: string): MailProvider | undefined {
  const domain = address.split("@")[1]?.toLowerCase();
  if (!domain) return undefined;
  if (/^(gmail|googlemail)\./.test(`${domain}.`)) return providerById("gmail");
  if (/^(outlook|hotmail|live|msn)\./.test(`${domain}.`)) return providerById("outlook");
  if (/^(yandex|ya)\./.test(`${domain}.`)) return providerById("yandex");
  if (/^(mail|inbox|bk|list)\.ru$/.test(domain)) return providerById("mailru");
  if (domain === "zoho.com") return providerById("zoho");
  return undefined;
}
