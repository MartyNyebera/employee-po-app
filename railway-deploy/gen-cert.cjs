/**
 * Generates a self-signed certificate using Node built-in crypto only.
 * Outputs server/cert.pem and server/cert.key
 * Run: node server/gen-cert.cjs
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Generate RSA key pair
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'der' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// Helper: encode length in DER format
function derLen(len) {
  if (len < 0x80) return Buffer.from([len]);
  const hex = len.toString(16).padStart(len > 0xff ? 4 : 2, '0');
  const bytes = Buffer.from(hex, 'hex');
  return Buffer.concat([Buffer.from([0x80 | bytes.length]), bytes]);
}

function derSeq(data) {
  return Buffer.concat([Buffer.from([0x30]), derLen(data.length), data]);
}

function derInt(data) {
  // Ensure positive
  if (data[0] & 0x80) data = Buffer.concat([Buffer.from([0x00]), data]);
  return Buffer.concat([Buffer.from([0x02]), derLen(data.length), data]);
}

function derBitString(data) {
  const inner = Buffer.concat([Buffer.from([0x00]), data]);
  return Buffer.concat([Buffer.from([0x03]), derLen(inner.length), inner]);
}

function derOctetString(data) {
  return Buffer.concat([Buffer.from([0x04]), derLen(data.length), data]);
}

function derOID(oidStr) {
  const parts = oidStr.split('.').map(Number);
  const bytes = [parts[0] * 40 + parts[1]];
  for (let i = 2; i < parts.length; i++) {
    let val = parts[i];
    const chunk = [val & 0x7f];
    val >>= 7;
    while (val > 0) { chunk.unshift((val & 0x7f) | 0x80); val >>= 7; }
    bytes.push(...chunk);
  }
  const buf = Buffer.from(bytes);
  return Buffer.concat([Buffer.from([0x06]), derLen(buf.length), buf]);
}

function derUTF8String(str) {
  const buf = Buffer.from(str, 'utf8');
  return Buffer.concat([Buffer.from([0x0c]), derLen(buf.length), buf]);
}

function derIA5String(str) {
  const buf = Buffer.from(str, 'ascii');
  return Buffer.concat([Buffer.from([0x16]), derLen(buf.length), buf]);
}

function derPrintableString(str) {
  const buf = Buffer.from(str, 'ascii');
  return Buffer.concat([Buffer.from([0x13]), derLen(buf.length), buf]);
}

function derUTCTime(date) {
  const s = date.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z';
  const buf = Buffer.from(s, 'ascii');
  return Buffer.concat([Buffer.from([0x17]), derLen(buf.length), buf]);
}

function derSet(data) {
  return Buffer.concat([Buffer.from([0x31]), derLen(data.length), data]);
}

function derExplicit(tag, data) {
  return Buffer.concat([Buffer.from([0xa0 | tag]), derLen(data.length), data]);
}

// Build subject/issuer: CN=localhost
function buildName(cn) {
  const cnAttr = derSeq(Buffer.concat([
    derOID('2.5.4.3'), // commonName
    derUTF8String(cn),
  ]));
  return derSeq(derSet(cnAttr));
}

// Build validity
const now = new Date();
const later = new Date(now.getTime() + 365 * 10 * 24 * 60 * 60 * 1000); // 10 years
function buildValidity(from, to) {
  return derSeq(Buffer.concat([derUTCTime(from), derUTCTime(to)]));
}

// SHA256withRSA OID
const sha256WithRSAOID = derSeq(Buffer.concat([
  derOID('1.2.840.113549.1.1.11'), // sha256WithRSAEncryption
  Buffer.from([0x05, 0x00]), // NULL
]));

// Build TBSCertificate
const serialNumber = derInt(crypto.randomBytes(16));
const subject = buildName('localhost');
const issuer = buildName('localhost');
const validity = buildValidity(now, later);

// SubjectPublicKeyInfo (already DER encoded from generateKeyPairSync)
const spki = publicKey;

// Extensions: SAN for IP 192.168.254.108 and localhost
function buildSAN() {
  // IP address: 192.168.254.108
  const ip = Buffer.from([192, 168, 254, 108]);
  const ipEntry = Buffer.concat([Buffer.from([0x87]), derLen(ip.length), ip]);
  // DNS: localhost
  const dns = Buffer.from('localhost', 'ascii');
  const dnsEntry = Buffer.concat([Buffer.from([0x82]), derLen(dns.length), dns]);
  const sanValue = derSeq(Buffer.concat([dnsEntry, ipEntry]));
  const sanOID = derOID('2.5.29.17'); // subjectAltName
  const sanExt = derSeq(Buffer.concat([sanOID, derOctetString(sanValue)]));
  const extensions = derSeq(sanExt);
  return derExplicit(3, extensions);
}

const tbsCert = derSeq(Buffer.concat([
  derExplicit(0, Buffer.from([0x02, 0x01, 0x02])), // version v3
  serialNumber,
  sha256WithRSAOID,
  issuer,
  validity,
  subject,
  spki,
  buildSAN(),
]));

// Sign TBSCertificate
const signature = crypto.sign('sha256', tbsCert, { key: privateKey, dsaEncoding: 'der' });

// Build full Certificate
const certificate = derSeq(Buffer.concat([
  tbsCert,
  sha256WithRSAOID,
  derBitString(signature),
]));

// Convert to PEM
const certPem = '-----BEGIN CERTIFICATE-----\n' +
  certificate.toString('base64').match(/.{1,64}/g).join('\n') +
  '\n-----END CERTIFICATE-----\n';

const outDir = path.join(__dirname);
fs.writeFileSync(path.join(outDir, 'cert.pem'), certPem);
fs.writeFileSync(path.join(outDir, 'cert.key'), privateKey);

console.log('Generated server/cert.pem and server/cert.key');
console.log('Valid for: localhost and 192.168.254.108');
console.log('Expires:', later.toDateString());
