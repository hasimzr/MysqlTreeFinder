const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const { encryptPassword, decryptPassword } = require('./cryptoUtils');

const app = express();
const PORT = process.env.PORT || 3000;
const CONNECTIONS_FILE = path.join(__dirname, 'connections.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/lucide', express.static(path.join(__dirname, 'node_modules/lucide/dist/umd')));

const DEFAULT_CONNECTIONS = [
  {
    id: 'conn-localhost',
    title: 'Localhost MySQL',
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '',
    database: '',
    ssl: false,
    isMock: false,
    askPassword: false,
    lastUsed: Date.now()
  },
  {
    id: 'conn-demo',
    title: 'Demo Modu (E-Ticaret Veritabanı)',
    host: 'demo.mysql.internal',
    port: 3306,
    user: 'demo_user',
    password: 'demo_password',
    database: 'ecommerce_prod',
    ssl: false,
    isMock: true,
    askPassword: false,
    lastUsed: Date.now() - 10000
  }
];

// Connections Storage Helpers
function readConnectionsFromFile() {
  try {
    if (fs.existsSync(CONNECTIONS_FILE)) {
      const data = fs.readFileSync(CONNECTIONS_FILE, 'utf8');
      const connections = JSON.parse(data);
      let needsSave = false;

      const processed = connections.map(conn => {
        const c = { ...conn };
        if (c.askPassword) {
          c.password = '';
        } else if (c.password && !c.password.startsWith('enc:v1:')) {
          c.password = encryptPassword(c.password);
          needsSave = true;
        }
        return c;
      });

      if (needsSave) {
        writeConnectionsToFile(processed);
      }
      return processed;
    } else {
      writeConnectionsToFile(DEFAULT_CONNECTIONS);
      return DEFAULT_CONNECTIONS;
    }
  } catch (err) {
    console.error('Error reading connections.json:', err.message);
    return [];
  }
}

function getSanitizedConnections(connections) {
  return connections.map(c => ({
    ...c,
    password: c.askPassword ? '' : decryptPassword(c.password)
  }));
}

function writeConnectionsToFile(connections) {
  try {
    fs.writeFileSync(CONNECTIONS_FILE, JSON.stringify(connections, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error writing connections.json:', err.message);
    return false;
  }
}

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'MySQL Tree Schema Finder API servisi aktif.' });
});

// GET Saved Connections
app.get('/api/connections', (req, res) => {
  const rawConnections = readConnectionsFromFile();
  const connections = getSanitizedConnections(rawConnections);
  res.json({ success: true, connections });
});

// SAVE or UPDATE Connection
app.post('/api/connections', (req, res) => {
  try {
    const connObj = req.body;
    if (!connObj.host || !connObj.user) {
      return res.status(400).json({ success: false, message: 'Host ve Kullanıcı Adı zorunludur.' });
    }

    let connections = readConnectionsFromFile();
    const connId = connObj.id || `conn-${Date.now()}`;
    const askPassword = !!connObj.askPassword;

    const newEntry = {
      id: connId,
      title: connObj.title || `${connObj.user}@${connObj.host}`,
      host: connObj.host,
      port: connObj.port || 3306,
      user: connObj.user,
      password: askPassword ? '' : encryptPassword(connObj.password || ''),
      database: connObj.database || '',
      ssl: !!connObj.ssl,
      isMock: !!connObj.isMock,
      askPassword: askPassword,
      lastUsed: Date.now()
    };

    const existingIndex = connections.findIndex(c => c.id === connId);
    if (existingIndex >= 0) {
      connections[existingIndex] = { ...connections[existingIndex], ...newEntry };
    } else {
      connections.unshift(newEntry);
    }

    writeConnectionsToFile(connections);
    const sanitized = getSanitizedConnections(connections);
    res.json({ success: true, connections: sanitized, message: 'Bağlantı başarıyla kaydedildi.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE Connection
app.delete('/api/connections/:id', (req, res) => {
  try {
    const connId = req.params.id;
    let connections = readConnectionsFromFile();
    connections = connections.filter(c => c.id !== connId);
    writeConnectionsToFile(connections);
    const sanitized = getSanitizedConnections(connections);
    res.json({ success: true, connections: sanitized, message: 'Bağlantı silindi.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Test Connection and Get List of Databases
app.post('/api/connect', async (req, res) => {
  try {
    const credentials = req.body;
    const result = await db.testConnection(credentials);
    res.json(result);
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Get Schema Tree (Databases -> Tables/Views -> Columns)
app.post('/api/schema-tree', async (req, res) => {
  try {
    const { credentials, schemaName } = req.body;
    if (!schemaName) {
      return res.status(400).json({ success: false, message: 'Lütfen bir şema adı belirtin.' });
    }
    const tree = await db.getSchemaTree(credentials, schemaName);
    res.json({ success: true, data: tree });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get Table Details (Sample Data, DDL, Indexes)
app.post('/api/table-details', async (req, res) => {
  try {
    const { credentials, schemaName, tableName } = req.body;
    if (!schemaName || !tableName) {
      return res.status(400).json({ success: false, message: 'Şema ve tablo adı gereklidir.' });
    }
    const details = await db.getTableDetails(credentials, schemaName, tableName);
    res.json({ success: true, data: details });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get Table Relations (Parent & Child Tables) for inline tree expansion
app.post('/api/table-relations', async (req, res) => {
  try {
    const { credentials, schemaName, tableName } = req.body;
    if (!schemaName || !tableName) {
      return res.status(400).json({ success: false, message: 'Şema ve tablo adı gereklidir.' });
    }
    const result = await db.getTableRelations(credentials, schemaName, tableName);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});// Get Table Data (Paginated)
app.post('/api/table-data', async (req, res) => {
  try {
    const { credentials, schemaName, tableName, page, limit } = req.body;
    if (!schemaName || !tableName) {
      return res.status(400).json({ success: false, message: 'Şema ve tablo adı gereklidir.' });
    }
    const result = await db.getTableData(credentials, schemaName, tableName, page, limit);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Execute SQL Query
app.post('/api/execute-query', async (req, res) => {
  try {
    const { credentials, schemaName, query } = req.body;
    const result = await db.executeQuery(credentials, schemaName, query);
    res.json(result);
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});


// Serve index.html for all SPA routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`🚀 MySQL Tree Schema Finder Sunucusu Başlatıldı!`);
  console.log(`🌐 Bağlantı Adresi: http://localhost:${PORT}`);
  console.log(`=================================================`);
});
