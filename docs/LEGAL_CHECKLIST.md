# Legal pages checklist

> **Not legal advice.** This checklist only helps an operator complete the
> templates `privacy.html` and `imprint.html`. Have the finished pages reviewed
> by a legal professional before going live.

Both pages are templates. The software facts in them (what is stored, for how
long, which logs exist) were checked against the backend and frontend code.
What is left are the operator-specific values, marked
`<mark class="legal-placeholder">[...]</mark>` on the page. When every
placeholder is replaced (or the sentence deleted where it does not apply),
remove the `legal-template-banner` paragraph at the top of each page.

Keep the pages in sync with the code: when data processing changes (new data,
new emails, new logs, changed retention), update `privacy.html`.

Column "Status":

- **Required**: needed for a compliant page in most setups.
- **If applicable**: required only in the situation described.
- **Choice**: an operator decision; the page needs an answer, but the content
  is up to you.
- **Optional**: may be deleted.

## privacy.html (27 placeholders)

| Placeholder                                                          | What the operator provides                                                                                                                                           | Example                                                                                                                        | Status                                     |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| `[LAST UPDATED DATE]`                                                | Date of the current version of the notice                                                                                                                            | 19 October 2026                                                                                                                | Required                                   |
| `[OPERATOR NAME]`                                                    | Name of the controller (person or company)                                                                                                                           | Jane Doe / Example Games UG (haftungsbeschränkt)                                                                               | Required                                   |
| `[POSTAL ADDRESS]`                                                   | Postal address of the controller                                                                                                                                     | Musterstraße 1, 12345 Musterstadt, Germany                                                                                     | Required                                   |
| `[CONTACT EMAIL]` (3x)                                               | Address for privacy questions and rights requests                                                                                                                    | privacy@example.com                                                                                                            | Required                                   |
| `[DATA PROTECTION OFFICER CONTACT]`                                  | Contact of the data protection officer, or delete the paragraph                                                                                                      | dpo@example.com                                                                                                                | If applicable (only if a DPO is appointed) |
| `[STATE WHAT THE DISCORD AND TELEGRAM HANDLES ARE USED FOR, ...]`    | Purpose of the optional Discord/Telegram handles                                                                                                                     | "to contact you about prizes and community events"                                                                             | Choice                                     |
| `[ADD OFF-SERVER BACKUP LOCATION AND RETENTION, IF ANY]`             | Where off-server backup copies are kept and for how long, or delete                                                                                                  | "and copied to Example Storage (Germany), kept 30 days"                                                                        | Choice (see decisions)                     |
| `[e.g. Art. 6(1)(b) GDPR (contract)]` (3x)                           | Legal basis for providing the game, account emails and rankings                                                                                                      | Art. 6(1)(b) GDPR                                                                                                              | Required (confirm)                         |
| `[e.g. Art. 6(1)(f) GDPR (legitimate interest in a secure service)]` | Legal basis for security log, admin audit, server logs, chat mutes                                                                                                   | Art. 6(1)(f) GDPR                                                                                                              | Required (confirm)                         |
| `[e.g. Art. 6(1)(f) GDPR (legitimate interest in availability)]`     | Legal basis for backups                                                                                                                                              | Art. 6(1)(f) GDPR                                                                                                              | Required (confirm)                         |
| `[MINIMUM AGE]`                                                      | Minimum age to create an account                                                                                                                                     | 16                                                                                                                             | Choice (see decisions)                     |
| `[HOSTING PROVIDER]`                                                 | Company that hosts the servers                                                                                                                                       | Example Hosting GmbH                                                                                                           | Required                                   |
| `[HOSTING LOCATION]`                                                 | Country / data centre region                                                                                                                                         | Germany (Nuremberg)                                                                                                            | Required                                   |
| `[EMAIL PROVIDER, NAME AND LOCATION]`                                | SMTP provider configured in `SMTP_HOST`; if email is disabled (`MAIL_BACKEND` not `smtp`), delete this bullet and the "Account emails" section and table row instead | Example Mail GmbH (Germany)                                                                                                    | Required if email is enabled               |
| `[OTHER RECIPIENTS, e.g. off-site backup storage, or "none"]`        | Any further recipient or processor                                                                                                                                   | "Example Storage (off-site backups)" or delete the bullet                                                                      | Choice                                     |
| `[NONE, OR DESCRIBE THE TRANSFER AND SAFEGUARD]`                     | Transfers outside the EU/EEA and their safeguard                                                                                                                     | "none" / "Example Inc. (USA), EU-US Data Privacy Framework"                                                                    | Required                                   |
| `[90]`                                                               | Security log retention in days; must match `AUTH_AUDIT_RETENTION_DAYS` in `backend.env` (unset = 90; 0 = keep forever, then reword)                                  | 90                                                                                                                             | Choice (default is fine)                   |
| `[DESCRIBE WHEN OLD ROUNDS ARE DELETED]`                             | Your practice for deleting finished rounds (the software never deletes rounds on its own)                                                                            | "; finished rounds are deleted after 30 days"                                                                                  | Choice                                     |
| `[LOG RETENTION PERIOD]`                                             | How long nginx and game server (journald) logs are kept                                                                                                              | "web server logs 14 days (logrotate default for nginx on Debian/Ubuntu), game server log 30 days (journald `MaxRetentionSec`)" | Required                                   |
| `[OFF-SERVER COPIES: RETENTION]`                                     | Retention of off-server backups, or "no off-server copies"                                                                                                           | "30 days" / "no off-server copies"                                                                                             | Choice                                     |
| `[SUPERVISORY AUTHORITY]`                                            | The data protection authority responsible for you                                                                                                                    | the data protection authority of your German federal state                                                                     | Required                                   |
| `[CONFIRM THAT HTTPS IS ENABLED]`                                    | Check that certbot set up TLS with redirect (and HSTS) for both domains, then delete the placeholder                                                                 | (delete after checking)                                                                                                        | Required                                   |
| `[WHO HAS ACCESS]`                                                   | Who can access servers and backups                                                                                                                                   | "the operator and one named technical administrator"                                                                           | Required                                   |

The banner text contains one more `[PLACEHOLDER]` mark; it disappears with the
banner.

## imprint.html (11 placeholders)

| Placeholder                                                     | What the operator provides                                                        | Example                                              | Status                                                                                          |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `[LAST UPDATED DATE]`                                           | Date of the current version                                                       | 19 October 2026                                      | Optional                                                                                        |
| `[OPERATOR NAME]`                                               | Full name of the person or company (§ 5 DDG)                                      | Jane Doe / Example Games UG (haftungsbeschränkt)     | Required                                                                                        |
| `[LEGAL FORM, if a company, and AUTHORISED REPRESENTATIVE]`     | Legal form and managing director(s); delete for a private person                  | represented by managing director John Doe            | If applicable                                                                                   |
| `[POSTAL ADDRESS]` (2x)                                         | Address that can be served (no P.O. box), for the operator and the content person | Musterstraße 1, 12345 Musterstadt, Germany           | Required                                                                                        |
| `[CONTACT EMAIL]`                                               | Email address                                                                     | contact@example.com                                  | Required                                                                                        |
| `[PHONE NUMBER OR CONTACT FORM]`                                | A second fast means of contact                                                    | +49 30 1234567                                       | Required                                                                                        |
| `[REGISTER COURT AND NUMBER]`                                   | Register court and number; delete for an unregistered person                      | Amtsgericht Musterstadt, HRB 12345                   | If applicable                                                                                   |
| `[VAT ID]`                                                      | VAT ID under § 27a UStG; delete if you have none                                  | DE123456789                                          | If applicable                                                                                   |
| `[RESPONSIBLE PERSON NAME]`                                     | Person responsible for editorial content (§ 18(2) MStV)                           | Jane Doe                                             | If applicable (editorial content, e.g. news, blog posts); often the same person as the operator |
| `[ADD OR REMOVE CLAUSES AS REQUIRED IN YOUR JURISDICTION, ...]` | Further clauses, or delete the paragraph                                          | statement on consumer dispute resolution (§ 36 VSBG) | Choice                                                                                          |

The imprint uses § 5 DDG (Digitale-Dienste-Gesetz), which replaced § 5 TMG in
May 2024. The link to the EU online dispute resolution (ODR) platform is no
longer needed: the platform was shut down in July 2025. If your activity needs
a permit or you work in a regulated profession, § 5 DDG requires further
details (supervisory authority, chamber, professional title); add them.

## Decisions for the operator

- **Minimum age.** Pick one (for example 16, the GDPR default age of consent in
  Germany) and decide whether you enforce it; the software does not check age.
- **Legal bases.** Confirm or change the suggested GDPR bases for each purpose
  in the table. No processing currently relies on consent.
- **Email.** Decide whether to enable account emails (`MAIL_BACKEND=smtp`).
  If yes, choose an SMTP provider, sign a data processing agreement and name it
  on the page. If not, delete the email paragraphs from `privacy.html`.
- **Off-server backups.** The shipped backup keeps 14 days on the same disk.
  Decide whether and where you copy backups off the server and give them the
  same bounded retention (deleted data otherwise survives in the copies).
- **Log retention.** Decide how long the nginx logs (logrotate) and the game
  server log (journald) are kept, and configure it to match the page.
- **Round deletion.** Rounds and their player entries stay until an
  administrator deletes them. Decide on a routine (for example "30 days after
  the end") and state it.
- **Discord/Telegram handles.** Decide what they are for, or remove the fields.
- **Language.** The pages are in English. For a German audience,
  German-language legal pages (Datenschutzerklärung, Impressum) are customary;
  consider keeping German versions as the primary text and the English pages as
  translations.
- **Data processing agreements.** Sign one with the hosting provider, the email
  provider and any backup storage provider.

> **Not legal advice.** The templates and this checklist describe what the
> software does; they do not replace a review of your specific situation.
