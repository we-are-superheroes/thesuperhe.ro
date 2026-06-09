/* ================================================================
   Locale lookup tables shared between server actions, the browse
   filters and the blueprint family chips. ISO 639-1 + 3166-1
   alpha-2 codes — see ISO references for the canonical list.

   Codes are stored as strings in the DB; this module is the single
   source of truth for the human label and what counts as valid.
   ================================================================ */

export interface LanguageOption {
  code: string // ISO 639-1, lower-case
  label: string
  display: string // short uppercase display chip ("EN", "DE")
}

export interface CountryOption {
  code: string // ISO 3166-1 alpha-2, upper-case
  label: string
}

export const LANGUAGES: LanguageOption[] = [
  { code: 'en', label: 'English', display: 'EN' },
  { code: 'de', label: 'Deutsch', display: 'DE' },
  { code: 'fr', label: 'Français', display: 'FR' },
  { code: 'it', label: 'Italiano', display: 'IT' },
  { code: 'es', label: 'Español', display: 'ES' },
  { code: 'nl', label: 'Nederlands', display: 'NL' },
  { code: 'pt', label: 'Português', display: 'PT' },
  { code: 'sv', label: 'Svenska', display: 'SV' },
  { code: 'da', label: 'Dansk', display: 'DA' },
  { code: 'no', label: 'Norsk', display: 'NO' },
  { code: 'fi', label: 'Suomi', display: 'FI' },
  { code: 'pl', label: 'Polski', display: 'PL' },
  { code: 'cs', label: 'Čeština', display: 'CS' },
]

/**
 * Full ISO 3166-1 alpha-2 list, sorted by English short label. Hardcoded
 * (rather than Intl.DisplayNames at runtime) so server and client render
 * identical labels regardless of ICU version — region names churn across
 * ICU releases, which would cause hydration mismatches. Flags are computed
 * from the code (regional indicator symbols) — see countryFlag().
 */
export const COUNTRIES: CountryOption[] = [
  { code: 'AF', label: 'Afghanistan' },
  { code: 'AX', label: 'Åland Islands' },
  { code: 'AL', label: 'Albania' },
  { code: 'DZ', label: 'Algeria' },
  { code: 'AS', label: 'American Samoa' },
  { code: 'AD', label: 'Andorra' },
  { code: 'AO', label: 'Angola' },
  { code: 'AI', label: 'Anguilla' },
  { code: 'AQ', label: 'Antarctica' },
  { code: 'AG', label: 'Antigua & Barbuda' },
  { code: 'AR', label: 'Argentina' },
  { code: 'AM', label: 'Armenia' },
  { code: 'AW', label: 'Aruba' },
  { code: 'AU', label: 'Australia' },
  { code: 'AT', label: 'Austria' },
  { code: 'AZ', label: 'Azerbaijan' },
  { code: 'BS', label: 'Bahamas' },
  { code: 'BH', label: 'Bahrain' },
  { code: 'BD', label: 'Bangladesh' },
  { code: 'BB', label: 'Barbados' },
  { code: 'BY', label: 'Belarus' },
  { code: 'BE', label: 'Belgium' },
  { code: 'BZ', label: 'Belize' },
  { code: 'BJ', label: 'Benin' },
  { code: 'BM', label: 'Bermuda' },
  { code: 'BT', label: 'Bhutan' },
  { code: 'BO', label: 'Bolivia' },
  { code: 'BA', label: 'Bosnia & Herzegovina' },
  { code: 'BW', label: 'Botswana' },
  { code: 'BR', label: 'Brazil' },
  { code: 'IO', label: 'British Indian Ocean Territory' },
  { code: 'VG', label: 'British Virgin Islands' },
  { code: 'BN', label: 'Brunei' },
  { code: 'BG', label: 'Bulgaria' },
  { code: 'BF', label: 'Burkina Faso' },
  { code: 'BI', label: 'Burundi' },
  { code: 'KH', label: 'Cambodia' },
  { code: 'CM', label: 'Cameroon' },
  { code: 'CA', label: 'Canada' },
  { code: 'CV', label: 'Cape Verde' },
  { code: 'BQ', label: 'Caribbean Netherlands' },
  { code: 'KY', label: 'Cayman Islands' },
  { code: 'CF', label: 'Central African Republic' },
  { code: 'TD', label: 'Chad' },
  { code: 'CL', label: 'Chile' },
  { code: 'CN', label: 'China' },
  { code: 'CX', label: 'Christmas Island' },
  { code: 'CC', label: 'Cocos (Keeling) Islands' },
  { code: 'CO', label: 'Colombia' },
  { code: 'KM', label: 'Comoros' },
  { code: 'CG', label: 'Congo - Brazzaville' },
  { code: 'CD', label: 'Congo - Kinshasa' },
  { code: 'CK', label: 'Cook Islands' },
  { code: 'CR', label: 'Costa Rica' },
  { code: 'CI', label: 'Côte d’Ivoire' },
  { code: 'HR', label: 'Croatia' },
  { code: 'CU', label: 'Cuba' },
  { code: 'CW', label: 'Curaçao' },
  { code: 'CY', label: 'Cyprus' },
  { code: 'CZ', label: 'Czechia' },
  { code: 'DK', label: 'Denmark' },
  { code: 'DJ', label: 'Djibouti' },
  { code: 'DM', label: 'Dominica' },
  { code: 'DO', label: 'Dominican Republic' },
  { code: 'EC', label: 'Ecuador' },
  { code: 'EG', label: 'Egypt' },
  { code: 'SV', label: 'El Salvador' },
  { code: 'GQ', label: 'Equatorial Guinea' },
  { code: 'ER', label: 'Eritrea' },
  { code: 'EE', label: 'Estonia' },
  { code: 'SZ', label: 'Eswatini' },
  { code: 'ET', label: 'Ethiopia' },
  { code: 'FK', label: 'Falkland Islands' },
  { code: 'FO', label: 'Faroe Islands' },
  { code: 'FJ', label: 'Fiji' },
  { code: 'FI', label: 'Finland' },
  { code: 'FR', label: 'France' },
  { code: 'GF', label: 'French Guiana' },
  { code: 'PF', label: 'French Polynesia' },
  { code: 'TF', label: 'French Southern Territories' },
  { code: 'GA', label: 'Gabon' },
  { code: 'GM', label: 'Gambia' },
  { code: 'GE', label: 'Georgia' },
  { code: 'DE', label: 'Germany' },
  { code: 'GH', label: 'Ghana' },
  { code: 'GI', label: 'Gibraltar' },
  { code: 'GR', label: 'Greece' },
  { code: 'GL', label: 'Greenland' },
  { code: 'GD', label: 'Grenada' },
  { code: 'GP', label: 'Guadeloupe' },
  { code: 'GU', label: 'Guam' },
  { code: 'GT', label: 'Guatemala' },
  { code: 'GG', label: 'Guernsey' },
  { code: 'GN', label: 'Guinea' },
  { code: 'GW', label: 'Guinea-Bissau' },
  { code: 'GY', label: 'Guyana' },
  { code: 'HT', label: 'Haiti' },
  { code: 'HN', label: 'Honduras' },
  { code: 'HK', label: 'Hong Kong' },
  { code: 'HU', label: 'Hungary' },
  { code: 'IS', label: 'Iceland' },
  { code: 'IN', label: 'India' },
  { code: 'ID', label: 'Indonesia' },
  { code: 'IR', label: 'Iran' },
  { code: 'IQ', label: 'Iraq' },
  { code: 'IE', label: 'Ireland' },
  { code: 'IM', label: 'Isle of Man' },
  { code: 'IL', label: 'Israel' },
  { code: 'IT', label: 'Italy' },
  { code: 'JM', label: 'Jamaica' },
  { code: 'JP', label: 'Japan' },
  { code: 'JE', label: 'Jersey' },
  { code: 'JO', label: 'Jordan' },
  { code: 'KZ', label: 'Kazakhstan' },
  { code: 'KE', label: 'Kenya' },
  { code: 'KI', label: 'Kiribati' },
  { code: 'KW', label: 'Kuwait' },
  { code: 'KG', label: 'Kyrgyzstan' },
  { code: 'LA', label: 'Laos' },
  { code: 'LV', label: 'Latvia' },
  { code: 'LB', label: 'Lebanon' },
  { code: 'LS', label: 'Lesotho' },
  { code: 'LR', label: 'Liberia' },
  { code: 'LY', label: 'Libya' },
  { code: 'LI', label: 'Liechtenstein' },
  { code: 'LT', label: 'Lithuania' },
  { code: 'LU', label: 'Luxembourg' },
  { code: 'MO', label: 'Macao' },
  { code: 'MG', label: 'Madagascar' },
  { code: 'MW', label: 'Malawi' },
  { code: 'MY', label: 'Malaysia' },
  { code: 'MV', label: 'Maldives' },
  { code: 'ML', label: 'Mali' },
  { code: 'MT', label: 'Malta' },
  { code: 'MH', label: 'Marshall Islands' },
  { code: 'MQ', label: 'Martinique' },
  { code: 'MR', label: 'Mauritania' },
  { code: 'MU', label: 'Mauritius' },
  { code: 'YT', label: 'Mayotte' },
  { code: 'MX', label: 'Mexico' },
  { code: 'FM', label: 'Micronesia' },
  { code: 'MD', label: 'Moldova' },
  { code: 'MC', label: 'Monaco' },
  { code: 'MN', label: 'Mongolia' },
  { code: 'ME', label: 'Montenegro' },
  { code: 'MS', label: 'Montserrat' },
  { code: 'MA', label: 'Morocco' },
  { code: 'MZ', label: 'Mozambique' },
  { code: 'MM', label: 'Myanmar (Burma)' },
  { code: 'NA', label: 'Namibia' },
  { code: 'NR', label: 'Nauru' },
  { code: 'NP', label: 'Nepal' },
  { code: 'NL', label: 'Netherlands' },
  { code: 'NC', label: 'New Caledonia' },
  { code: 'NZ', label: 'New Zealand' },
  { code: 'NI', label: 'Nicaragua' },
  { code: 'NE', label: 'Niger' },
  { code: 'NG', label: 'Nigeria' },
  { code: 'NU', label: 'Niue' },
  { code: 'NF', label: 'Norfolk Island' },
  { code: 'KP', label: 'North Korea' },
  { code: 'MK', label: 'North Macedonia' },
  { code: 'MP', label: 'Northern Mariana Islands' },
  { code: 'NO', label: 'Norway' },
  { code: 'OM', label: 'Oman' },
  { code: 'PK', label: 'Pakistan' },
  { code: 'PW', label: 'Palau' },
  { code: 'PS', label: 'Palestinian Territories' },
  { code: 'PA', label: 'Panama' },
  { code: 'PG', label: 'Papua New Guinea' },
  { code: 'PY', label: 'Paraguay' },
  { code: 'PE', label: 'Peru' },
  { code: 'PH', label: 'Philippines' },
  { code: 'PN', label: 'Pitcairn Islands' },
  { code: 'PL', label: 'Poland' },
  { code: 'PT', label: 'Portugal' },
  { code: 'PR', label: 'Puerto Rico' },
  { code: 'QA', label: 'Qatar' },
  { code: 'RE', label: 'Réunion' },
  { code: 'RO', label: 'Romania' },
  { code: 'RU', label: 'Russia' },
  { code: 'RW', label: 'Rwanda' },
  { code: 'WS', label: 'Samoa' },
  { code: 'SM', label: 'San Marino' },
  { code: 'ST', label: 'São Tomé & Príncipe' },
  { code: 'SA', label: 'Saudi Arabia' },
  { code: 'SN', label: 'Senegal' },
  { code: 'RS', label: 'Serbia' },
  { code: 'SC', label: 'Seychelles' },
  { code: 'SL', label: 'Sierra Leone' },
  { code: 'SG', label: 'Singapore' },
  { code: 'SX', label: 'Sint Maarten' },
  { code: 'SK', label: 'Slovakia' },
  { code: 'SI', label: 'Slovenia' },
  { code: 'SB', label: 'Solomon Islands' },
  { code: 'SO', label: 'Somalia' },
  { code: 'ZA', label: 'South Africa' },
  { code: 'GS', label: 'South Georgia & South Sandwich Islands' },
  { code: 'KR', label: 'South Korea' },
  { code: 'SS', label: 'South Sudan' },
  { code: 'ES', label: 'Spain' },
  { code: 'LK', label: 'Sri Lanka' },
  { code: 'BL', label: 'St. Barthélemy' },
  { code: 'SH', label: 'St. Helena' },
  { code: 'KN', label: 'St. Kitts & Nevis' },
  { code: 'LC', label: 'St. Lucia' },
  { code: 'MF', label: 'St. Martin' },
  { code: 'PM', label: 'St. Pierre & Miquelon' },
  { code: 'VC', label: 'St. Vincent & Grenadines' },
  { code: 'SD', label: 'Sudan' },
  { code: 'SR', label: 'Suriname' },
  { code: 'SJ', label: 'Svalbard & Jan Mayen' },
  { code: 'SE', label: 'Sweden' },
  { code: 'CH', label: 'Switzerland' },
  { code: 'SY', label: 'Syria' },
  { code: 'TW', label: 'Taiwan' },
  { code: 'TJ', label: 'Tajikistan' },
  { code: 'TZ', label: 'Tanzania' },
  { code: 'TH', label: 'Thailand' },
  { code: 'TL', label: 'Timor-Leste' },
  { code: 'TG', label: 'Togo' },
  { code: 'TK', label: 'Tokelau' },
  { code: 'TO', label: 'Tonga' },
  { code: 'TT', label: 'Trinidad & Tobago' },
  { code: 'TN', label: 'Tunisia' },
  { code: 'TR', label: 'Türkiye' },
  { code: 'TM', label: 'Turkmenistan' },
  { code: 'TC', label: 'Turks & Caicos Islands' },
  { code: 'TV', label: 'Tuvalu' },
  { code: 'UM', label: 'U.S. Outlying Islands' },
  { code: 'VI', label: 'U.S. Virgin Islands' },
  { code: 'UG', label: 'Uganda' },
  { code: 'UA', label: 'Ukraine' },
  { code: 'AE', label: 'United Arab Emirates' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'US', label: 'United States' },
  { code: 'UY', label: 'Uruguay' },
  { code: 'UZ', label: 'Uzbekistan' },
  { code: 'VU', label: 'Vanuatu' },
  { code: 'VA', label: 'Vatican City' },
  { code: 'VE', label: 'Venezuela' },
  { code: 'VN', label: 'Vietnam' },
  { code: 'WF', label: 'Wallis & Futuna' },
  { code: 'EH', label: 'Western Sahara' },
  { code: 'YE', label: 'Yemen' },
  { code: 'ZM', label: 'Zambia' },
  { code: 'ZW', label: 'Zimbabwe' },
]

const LANGUAGE_CODES = new Set(LANGUAGES.map((l) => l.code))
const COUNTRY_CODES = new Set(COUNTRIES.map((c) => c.code))

/**
 * Normalise + validate a language code. Returns the canonical lower-case
 * code, or null for empty input. Throws if the code isn't recognised.
 */
export function normaliseLanguage(raw: string): string | null {
  const v = raw.trim().toLowerCase()
  if (!v) return null
  if (!LANGUAGE_CODES.has(v)) {
    throw new Error('Unrecognised language code.')
  }
  return v
}

/**
 * Normalise + validate a country code. Returns the canonical upper-case
 * code, or null for empty input. Throws if the code isn't recognised.
 */
export function normaliseCountry(raw: string): string | null {
  const v = raw.trim().toUpperCase()
  if (!v) return null
  if (!COUNTRY_CODES.has(v)) {
    throw new Error('Unrecognised country code.')
  }
  return v
}

export function languageLabel(code: string | null | undefined): string | null {
  if (!code) return null
  return LANGUAGES.find((l) => l.code === code)?.label ?? null
}

export function languageDisplay(code: string | null | undefined): string | null {
  if (!code) return null
  return LANGUAGES.find((l) => l.code === code)?.display ?? null
}

const COUNTRY_LABELS = new Map(COUNTRIES.map((c) => [c.code, c.label]))

export function countryLabel(code: string | null | undefined): string | null {
  if (!code) return null
  return COUNTRY_LABELS.get(code.toUpperCase()) ?? null
}

/**
 * Flag emoji computed from the alpha-2 code via regional indicator symbols —
 * pure code-point math, so server and client always agree.
 */
export function countryFlag(code: string | null | undefined): string | null {
  if (!code) return null
  const c = code.toUpperCase()
  if (!COUNTRY_CODES.has(c)) return null
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65))
}
