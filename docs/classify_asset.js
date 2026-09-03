const SERVICE_WEIGHTS = {
  21: 7,    // FTP
  22: 9,    // SSH
  23: 12,   // Telnet
  25: 4,    // SMTP
  80: 5,    // HTTP
  161: 6,   // SNMP
  389: 7,   // LDAP
  443: 4,   // HTTPS
  445: 8,   // SMB
  587: 4,   // SMTP submission
  3306: 11, // MySQL
  5432: 11, // PostgreSQL
  6379: 11, // Redis
  8080: 5,  // HTTP alt
};

function classifyAsset(openPorts) {
  const score = openPorts.reduce(
    (sum, port) => sum + (SERVICE_WEIGHTS[port] || 1),
    0
  );

  let classification;
  if (score > 20) classification = 'Critico';
  else if (score > 10) classification = 'Alto';
  else classification = 'Normal';

  return { score, classification };
}

module.exports = { SERVICE_WEIGHTS, classifyAsset };
