const mysql = require('mysql2/promise');

/**
 * Creates a connection object using supplied credentials
 */
function createConnectionConfig(credentials) {
  return {
    host: credentials.host || 'localhost',
    port: parseInt(credentials.port || 3306, 10),
    user: credentials.user || 'root',
    password: credentials.password || '',
    database: credentials.database || undefined,
    connectTimeout: 10000,
    ssl: credentials.ssl ? { rejectUnauthorized: false } : undefined
  };
}

/**
 * Test MySQL database connection and return list of databases
 */
async function testConnection(credentials) {
  if (credentials.isMock) {
    return {
      success: true,
      message: 'Demo Modu bağlantısı başarılı!',
      databases: ['ecommerce_prod', 'university_portal', 'hr_analytics']
    };
  }

  const config = createConnectionConfig(credentials);
  let connection;
  try {
    connection = await mysql.createConnection(config);
    await connection.ping();

    const [rows] = await connection.query('SHOW DATABASES');
    const databases = rows
      .map(r => r.Database || r.database)
      .filter(db => db !== undefined);

    await connection.end();
    return {
      success: true,
      message: 'MySQL veritabanına başarıyla bağlandı!',
      databases
    };
  } catch (error) {
    if (connection) {
      try { await connection.end(); } catch (e) {}
    }
    throw new Error(`Bağlantı Hatası: ${error.message}`);
  }
}

/**
 * Fetch detailed Schema Tree (Databases -> Tables/Views -> Columns, PK/FK)
 */
async function getSchemaTree(credentials, selectedSchema) {
  if (credentials.isMock) {
    return getMockSchemaData(selectedSchema);
  }

  const config = createConnectionConfig(credentials);
  let connection;

  try {
    connection = await mysql.createConnection(config);

    // 1. Get Tables & Views for selected schema
    const [tablesRows] = await connection.query(
      `SELECT TABLE_NAME, TABLE_TYPE, TABLE_ROWS, ENGINE, CREATE_TIME, TABLE_COMMENT 
       FROM INFORMATION_SCHEMA.TABLES 
       WHERE TABLE_SCHEMA = ? 
       ORDER BY TABLE_NAME ASC`,
      [selectedSchema]
    );

    // 2. Get Columns for selected schema
    const [columnsRows] = await connection.query(
      `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT, EXTRA, COLUMN_COMMENT
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ?
       ORDER BY TABLE_NAME ASC, ORDINAL_POSITION ASC`,
      [selectedSchema]
    );

    // 3. Get Foreign Keys for selected schema
    const [fkRows] = await connection.query(
      `SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
       FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
      [selectedSchema]
    );

    await connection.end();

    // Map foreign keys for fast lookup
    const fkMap = {};
    fkRows.forEach(fk => {
      const key = `${fk.TABLE_NAME}.${fk.COLUMN_NAME}`;
      fkMap[key] = {
        constraintName: fk.CONSTRAINT_NAME,
        targetTable: fk.REFERENCED_TABLE_NAME,
        targetColumn: fk.REFERENCED_COLUMN_NAME
      };
    });

    // Group columns by table
    const columnsByTable = {};
    columnsRows.forEach(col => {
      if (!columnsByTable[col.TABLE_NAME]) {
        columnsByTable[col.TABLE_NAME] = [];
      }
      const fkKey = `${col.TABLE_NAME}.${col.COLUMN_NAME}`;
      const fkInfo = fkMap[fkKey] || null;

      columnsByTable[col.TABLE_NAME].push({
        name: col.COLUMN_NAME,
        dataType: col.DATA_TYPE,
        columnType: col.COLUMN_TYPE,
        isNullable: col.IS_NULLABLE === 'YES',
        isPk: col.COLUMN_KEY === 'PRI',
        isFk: !!fkInfo,
        foreignKey: fkInfo,
        default: col.COLUMN_DEFAULT,
        extra: col.EXTRA,
        comment: col.COLUMN_COMMENT
      });
    });

    // Format tables list
    const tables = tablesRows.map(t => ({
      name: t.TABLE_NAME,
      type: t.TABLE_TYPE === 'VIEW' ? 'VIEW' : 'TABLE',
      rowCount: t.TABLE_ROWS || 0,
      engine: t.ENGINE || 'InnoDB',
      created: t.CREATE_TIME,
      comment: t.TABLE_COMMENT || '',
      columns: columnsByTable[t.TABLE_NAME] || []
    }));

    return {
      schemaName: selectedSchema,
      tablesCount: tables.length,
      tables
    };
  } catch (error) {
    if (connection) {
      try { await connection.end(); } catch (e) {}
    }
    throw new Error(`Şema detayları alınamadı: ${error.message}`);
  }
}

/**
 * Fetch Table specifics (Sample data, CREATE TABLE DDL, Indexes)
 */
async function getTableDetails(credentials, schemaName, tableName) {
  if (credentials.isMock) {
    return getMockTableDetails(schemaName, tableName);
  }

  const config = createConnectionConfig(credentials);
  let connection;

  try {
    connection = await mysql.createConnection(config);

    // Escape table and schema names safely
    const escapedSchema = mysql.escapeId(schemaName);
    const escapedTable = mysql.escapeId(tableName);
    const fullTableName = `${escapedSchema}.${escapedTable}`;

    // Table Data (Paginated, default page 1, limit 25)
    let tableData = { rows: [], totalRows: 0, page: 1, limit: 25, totalPages: 1 };
    try {
      tableData = await getTableData(credentials, schemaName, tableName, 1, 25);
    } catch (e) {
      tableData = { rows: [], totalRows: 0, page: 1, limit: 25, totalPages: 1 };
    }
    let sampleData = tableData.rows;

    // DDL query
    let createSql = '';
    try {
      const [ddlRows] = await connection.query(`SHOW CREATE TABLE ${fullTableName}`);
      if (ddlRows && ddlRows.length > 0) {
        createSql = ddlRows[0]['Create Table'] || ddlRows[0]['Create View'] || '';
      }
    } catch (e) {
      createSql = `-- DDL çekilemedi: ${e.message}`;
    }

    // Indexes query
    let indexes = [];
    try {
      const [idxRows] = await connection.query(
        `SELECT INDEX_NAME, COLUMN_NAME, NON_UNIQUE, SEQ_IN_INDEX, INDEX_TYPE 
         FROM INFORMATION_SCHEMA.STATISTICS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? 
         ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
        [schemaName, tableName]
      );
      
      const idxMap = {};
      idxRows.forEach(row => {
        if (!idxMap[row.INDEX_NAME]) {
          idxMap[row.INDEX_NAME] = {
            name: row.INDEX_NAME,
            isUnique: row.NON_UNIQUE === 0,
            type: row.INDEX_TYPE,
            columns: []
          };
        }
        idxMap[row.INDEX_NAME].columns.push(row.COLUMN_NAME);
      });
      indexes = Object.values(idxMap);
    } catch (e) {
      indexes = [];
    }

    // Relations (Parents and Children)
    let relations = { parents: [], children: [] };
    try {
      // 1. Parent tables (Tables that THIS table points to)
      const [parentsRows] = await connection.query(
        `SELECT COLUMN_NAME as sourceColumn, REFERENCED_TABLE_NAME as parentTable, REFERENCED_COLUMN_NAME as parentColumn, CONSTRAINT_NAME as constraintName
         FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
        [schemaName, tableName]
      );

      // 2. Child tables (Tables that point to THIS table)
      const [childrenRows] = await connection.query(
        `SELECT TABLE_NAME as childTable, COLUMN_NAME as childColumn, REFERENCED_COLUMN_NAME as parentColumn, CONSTRAINT_NAME as constraintName
         FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
        [schemaName, tableName]
      );

      relations.parents = parentsRows.map(r => ({
        sourceColumn: r.sourceColumn,
        parentTable: r.parentTable,
        parentColumn: r.parentColumn,
        constraintName: r.constraintName
      }));

      relations.children = childrenRows.map(r => ({
        childTable: r.childTable,
        childColumn: r.childColumn,
        parentColumn: r.parentColumn,
        constraintName: r.constraintName
      }));
    } catch (e) {
      relations = { parents: [], children: [] };
    }

    await connection.end();

    return {
      schemaName,
      tableName,
      sampleData,
      tableData,
      createSql,
      indexes,
      relations
    };
  } catch (error) {
    if (connection) {
      try { await connection.end(); } catch (e) {}
    }
    throw new Error(`Tablo detayları alınamadı: ${error.message}`);
  }
}

/**
 * Mock Data Generator for Demo Mode
 */
function getMockSchemaData(selectedSchema = 'ecommerce_prod') {
  const mockDatabases = {
    ecommerce_prod: {
      schemaName: 'ecommerce_prod',
      tablesCount: 5,
      tables: [
        {
          name: 'users',
          type: 'TABLE',
          rowCount: 14250,
          engine: 'InnoDB',
          comment: 'Müşteri ve kullanıcı hesapları',
          columns: [
            { name: 'id', dataType: 'bigint', columnType: 'bigint(20) unsigned', isNullable: false, isPk: true, isFk: false, extra: 'auto_increment' },
            { name: 'full_name', dataType: 'varchar', columnType: 'varchar(150)', isNullable: false, isPk: false, isFk: false },
            { name: 'email', dataType: 'varchar', columnType: 'varchar(255)', isNullable: false, isPk: false, isFk: false },
            { name: 'password_hash', dataType: 'varchar', columnType: 'varchar(255)', isNullable: false, isPk: false, isFk: false },
            { name: 'phone', dataType: 'varchar', columnType: 'varchar(30)', isNullable: true, isPk: false, isFk: false },
            { name: 'status', dataType: 'enum', columnType: "enum('active','suspended','pending')", isNullable: false, isPk: false, isFk: false, default: 'active' },
            { name: 'created_at', dataType: 'timestamp', columnType: 'timestamp', isNullable: false, isPk: false, isFk: false, default: 'CURRENT_TIMESTAMP' }
          ]
        },
        {
          name: 'categories',
          type: 'TABLE',
          rowCount: 84,
          engine: 'InnoDB',
          comment: 'Ürün kategorileri ve hiyerarşi',
          columns: [
            { name: 'id', dataType: 'int', columnType: 'int(11) unsigned', isNullable: false, isPk: true, isFk: false, extra: 'auto_increment' },
            { name: 'parent_id', dataType: 'int', columnType: 'int(11) unsigned', isNullable: true, isPk: false, isFk: true, foreignKey: { constraintName: 'fk_cat_parent', targetTable: 'categories', targetColumn: 'id' } },
            { name: 'slug', dataType: 'varchar', columnType: 'varchar(100)', isNullable: false, isPk: false, isFk: false },
            { name: 'name', dataType: 'varchar', columnType: 'varchar(100)', isNullable: false, isPk: false, isFk: false }
          ]
        },
        {
          name: 'products',
          type: 'TABLE',
          rowCount: 3200,
          engine: 'InnoDB',
          comment: 'Katalog ürünleri',
          columns: [
            { name: 'id', dataType: 'bigint', columnType: 'bigint(20) unsigned', isNullable: false, isPk: true, isFk: false, extra: 'auto_increment' },
            { name: 'category_id', dataType: 'int', columnType: 'int(11) unsigned', isNullable: false, isPk: false, isFk: true, foreignKey: { constraintName: 'fk_prod_cat', targetTable: 'categories', targetColumn: 'id' } },
            { name: 'title', dataType: 'varchar', columnType: 'varchar(200)', isNullable: false, isPk: false, isFk: false },
            { name: 'sku', dataType: 'varchar', columnType: 'varchar(50)', isNullable: false, isPk: false, isFk: false },
            { name: 'price', dataType: 'decimal', columnType: 'decimal(10,2)', isNullable: false, isPk: false, isFk: false },
            { name: 'stock_quantity', dataType: 'int', columnType: 'int(11)', isNullable: false, isPk: false, isFk: false, default: '0' }
          ]
        },
        {
          name: 'orders',
          type: 'TABLE',
          rowCount: 28400,
          engine: 'InnoDB',
          comment: 'Müşteri siparişleri',
          columns: [
            { name: 'id', dataType: 'bigint', columnType: 'bigint(20) unsigned', isNullable: false, isPk: true, isFk: false, extra: 'auto_increment' },
            { name: 'user_id', dataType: 'bigint', columnType: 'bigint(20) unsigned', isNullable: false, isPk: false, isFk: true, foreignKey: { constraintName: 'fk_orders_user', targetTable: 'users', targetColumn: 'id' } },
            { name: 'total_amount', dataType: 'decimal', columnType: 'decimal(12,2)', isNullable: false, isPk: false, isFk: false },
            { name: 'order_status', dataType: 'enum', columnType: "enum('pending','paid','shipped','cancelled')", isNullable: false, isPk: false, isFk: false, default: 'pending' },
            { name: 'created_at', dataType: 'timestamp', columnType: 'timestamp', isNullable: false, isPk: false, isFk: false, default: 'CURRENT_TIMESTAMP' }
          ]
        },
        {
          name: 'v_active_orders',
          type: 'VIEW',
          rowCount: 120,
          engine: 'Memory',
          comment: 'Aktif ödenmiş ve kargodaki siparişler görünümü',
          columns: [
            { name: 'order_id', dataType: 'bigint', columnType: 'bigint(20)', isNullable: false, isPk: false, isFk: false },
            { name: 'customer_name', dataType: 'varchar', columnType: 'varchar(150)', isNullable: false, isPk: false, isFk: false },
            { name: 'email', dataType: 'varchar', columnType: 'varchar(255)', isNullable: false, isPk: false, isFk: false },
            { name: 'total_amount', dataType: 'decimal', columnType: 'decimal(12,2)', isNullable: false, isPk: false, isFk: false },
            { name: 'order_status', dataType: 'varchar', columnType: 'varchar(20)', isNullable: false, isPk: false, isFk: false }
          ]
        }
      ]
    },
    university_portal: {
      schemaName: 'university_portal',
      tablesCount: 3,
      tables: [
        {
          name: 'students',
          type: 'TABLE',
          rowCount: 4500,
          engine: 'InnoDB',
          comment: 'Öğrenci kayıtları',
          columns: [
            { name: 'student_no', dataType: 'int', columnType: 'int(9)', isNullable: false, isPk: true, isFk: false },
            { name: 'first_name', dataType: 'varchar', columnType: 'varchar(50)', isNullable: false, isPk: false, isFk: false },
            { name: 'last_name', dataType: 'varchar', columnType: 'varchar(50)', isNullable: false, isPk: false, isFk: false },
            { name: 'gpa', dataType: 'float', columnType: 'float(3,2)', isNullable: true, isPk: false, isFk: false }
          ]
        },
        {
          name: 'courses',
          type: 'TABLE',
          rowCount: 320,
          engine: 'InnoDB',
          comment: 'Dersler listesi',
          columns: [
            { name: 'code', dataType: 'varchar', columnType: 'varchar(10)', isNullable: false, isPk: true, isFk: false },
            { name: 'title', dataType: 'varchar', columnType: 'varchar(100)', isNullable: false, isPk: false, isFk: false },
            { name: 'credits', dataType: 'tinyint', columnType: 'tinyint(2)', isNullable: false, isPk: false, isFk: false }
          ]
        },
        {
          name: 'enrollments',
          type: 'TABLE',
          rowCount: 18900,
          engine: 'InnoDB',
          comment: 'Ders kayıtları',
          columns: [
            { name: 'id', dataType: 'bigint', columnType: 'bigint(20)', isNullable: false, isPk: true, isFk: false, extra: 'auto_increment' },
            { name: 'student_no', dataType: 'int', columnType: 'int(9)', isNullable: false, isPk: false, isFk: true, foreignKey: { constraintName: 'fk_enr_student', targetTable: 'students', targetColumn: 'student_no' } },
            { name: 'course_code', dataType: 'varchar', columnType: 'varchar(10)', isNullable: false, isPk: false, isFk: true, foreignKey: { constraintName: 'fk_enr_course', targetTable: 'courses', targetColumn: 'code' } },
            { name: 'grade', dataType: 'varchar', columnType: 'varchar(2)', isNullable: true, isPk: false, isFk: false }
          ]
        }
      ]
    },
    hr_analytics: {
      schemaName: 'hr_analytics',
      tablesCount: 2,
      tables: [
        {
          name: 'employees',
          type: 'TABLE',
          rowCount: 680,
          engine: 'InnoDB',
          comment: 'Şirket personeli',
          columns: [
            { name: 'emp_id', dataType: 'int', columnType: 'int(11)', isNullable: false, isPk: true, isFk: false },
            { name: 'name', dataType: 'varchar', columnType: 'varchar(100)', isNullable: false, isPk: false, isFk: false },
            { name: 'salary', dataType: 'decimal', columnType: 'decimal(10,2)', isNullable: false, isPk: false, isFk: false }
          ]
        },
        {
          name: 'departments',
          type: 'TABLE',
          rowCount: 12,
          engine: 'InnoDB',
          comment: 'Departmanlar',
          columns: [
            { name: 'dept_id', dataType: 'int', columnType: 'int(11)', isNullable: false, isPk: true, isFk: false },
            { name: 'dept_name', dataType: 'varchar', columnType: 'varchar(50)', isNullable: false, isPk: false, isFk: false }
          ]
        }
      ]
    }
  };

  return mockDatabases[selectedSchema] || mockDatabases['ecommerce_prod'];
}

function getMockTableDetails(schemaName, tableName) {
  const mockSamples = {
    users: [
      { id: 1, full_name: 'Ahmet Yılmaz', email: 'ahmet@example.com', phone: '+90 532 111 2233', status: 'active', created_at: '2026-01-15 10:20:00' },
      { id: 2, full_name: 'Ayşe Demir', email: 'ayse@example.com', phone: '+90 533 444 5566', status: 'active', created_at: '2026-02-10 14:45:00' },
      { id: 3, full_name: 'Mehmet Kaya', email: 'mehmet@example.com', phone: '+90 535 777 8899', status: 'suspended', created_at: '2026-03-01 09:12:00' }
    ],
    products: [
      { id: 101, category_id: 1, title: 'Kablosuz Oyuncu Kulaklığı', sku: 'AUDIO-HP-01', price: 1499.99, stock_quantity: 45 },
      { id: 102, category_id: 1, title: 'Mekanik Klavye RGB', sku: 'PERIPHERAL-KB-02', price: 2199.00, stock_quantity: 18 },
      { id: 103, category_id: 2, title: '27 inç 4K Monitör 144Hz', sku: 'DISP-MON-03', price: 8999.50, stock_quantity: 8 }
    ],
    orders: [
      { id: 5001, user_id: 1, total_amount: 1499.99, order_status: 'paid', created_at: '2026-08-20 11:30:00' },
      { id: 5002, user_id: 2, total_amount: 11198.50, order_status: 'shipped', created_at: '2026-08-21 16:15:00' }
    ]
  };

  const sampleData = mockSamples[tableName] || [
    { id: 1, sample_field_1: 'Demo Değeri 1', sample_field_2: 100, created_at: '2026-08-24 12:00:00' },
    { id: 2, sample_field_1: 'Demo Değeri 2', sample_field_2: 250, created_at: '2026-08-24 13:00:00' }
  ];

  const createSql = `CREATE TABLE \`${tableName}\` (
  \`id\` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  \`name\` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`;

  const indexes = [
    { name: 'PRIMARY', isUnique: true, type: 'BTREE', columns: ['id'] },
    { name: `idx_${tableName}_search`, isUnique: false, type: 'BTREE', columns: ['name'] }
  ];

  // Mock Relations lookup table
  const mockRelationsMap = {
    school: {
      parents: [],
      children: [
        { childTable: 'ai_usage_histories', childColumn: 'school_id', parentColumn: 'id', constraintName: 'FKcv23acl1ktqlvqbda1k94dtki' },
        { childTable: 'courses', childColumn: 'school_id', parentColumn: 'id', constraintName: 'FKbea8engsjxgnbyaf3ual7ab60' },
        { childTable: 'exam_templates', childColumn: 'school_id', parentColumn: 'id', constraintName: 'FK3p1fut1ba9u295rkwo59qkbs3' },
        { childTable: 'users', childColumn: 'school_id', parentColumn: 'id', constraintName: 'fk_users_school' },
        { childTable: 'departments', childColumn: 'school_id', parentColumn: 'id', constraintName: 'fk_dept_school' }
      ]
    },
    ai_usage_histories: {
      parents: [
        { sourceColumn: 'school_id', parentTable: 'school', parentColumn: 'id', constraintName: 'FKcv23acl1ktqlvqbda1k94dtki' }
      ],
      children: []
    },
    exam_templates: {
      parents: [
        { sourceColumn: 'school_id', parentTable: 'school', parentColumn: 'id', constraintName: 'FK3p1fut1ba9u295rkwo59qkbs3' }
      ],
      children: [
        { childTable: 'exams', childColumn: 'template_id', parentColumn: 'id', constraintName: 'fk_exams_template' }
      ]
    },
    courses: {
      parents: [
        { sourceColumn: 'school_id', parentTable: 'school', parentColumn: 'id', constraintName: 'FKbea8engsjxgnbyaf3ual7ab60' }
      ],
      children: [
        { childTable: 'classrooms', childColumn: 'course_id', parentColumn: 'id', constraintName: 'FKptrcjflhvj48duhcaq4f3x9j0' },
        { childTable: 'user_courses', childColumn: 'course_id', parentColumn: 'id', constraintName: 'FKb84hga2qpwc4vv44lmyb8mwux' }
      ]
    },
    classrooms: {
      parents: [
        { sourceColumn: 'course_id', parentTable: 'courses', parentColumn: 'id', constraintName: 'FKptrcjflhvj48duhcaq4f3x9j0' }
      ],
      children: [
        { childTable: 'student_assignments', childColumn: 'classroom_id', parentColumn: 'id', constraintName: 'fk_assign_classroom' },
        { childTable: 'classroom_schedules', childColumn: 'classroom_id', parentColumn: 'id', constraintName: 'fk_sched_classroom' }
      ]
    },
    user_courses: {
      parents: [
        { sourceColumn: 'course_id', parentTable: 'courses', parentColumn: 'id', constraintName: 'FKb84hga2qpwc4vv44lmyb8mwux' },
        { sourceColumn: 'user_id', parentTable: 'users', parentColumn: 'id', constraintName: 'fk_uc_user' }
      ],
      children: [
        { childTable: 'course_grades', childColumn: 'user_course_id', parentColumn: 'id', constraintName: 'fk_grades_uc' }
      ]
    },
    users: {
      parents: [
        { sourceColumn: 'school_id', parentTable: 'school', parentColumn: 'id', constraintName: 'fk_users_school' }
      ],
      children: [
        { childTable: 'orders', childColumn: 'user_id', parentColumn: 'id', constraintName: 'fk_orders_user' },
        { childTable: 'user_courses', childColumn: 'user_id', parentColumn: 'id', constraintName: 'fk_uc_user' }
      ]
    },
    categories: {
      parents: [
        { sourceColumn: 'parent_id', parentTable: 'categories', parentColumn: 'id', constraintName: 'fk_cat_parent' }
      ],
      children: [
        { childTable: 'categories', childColumn: 'parent_id', parentColumn: 'id', constraintName: 'fk_cat_parent' },
        { childTable: 'products', childColumn: 'category_id', parentColumn: 'id', constraintName: 'fk_prod_cat' }
      ]
    },
    products: {
      parents: [
        { sourceColumn: 'category_id', parentTable: 'categories', parentColumn: 'id', constraintName: 'fk_prod_cat' }
      ],
      children: [
        { childTable: 'order_items', childColumn: 'product_id', parentColumn: 'id', constraintName: 'fk_items_prod' }
      ]
    },
    orders: {
      parents: [
        { sourceColumn: 'user_id', parentTable: 'users', parentColumn: 'id', constraintName: 'fk_orders_user' }
      ],
      children: [
        { childTable: 'order_items', childColumn: 'order_id', parentColumn: 'id', constraintName: 'fk_items_order' }
      ]
    },
    order_items: {
      parents: [
        { sourceColumn: 'order_id', parentTable: 'orders', parentColumn: 'id', constraintName: 'fk_items_order' },
        { sourceColumn: 'product_id', parentTable: 'products', parentColumn: 'id', constraintName: 'fk_items_prod' }
      ],
      children: []
    },
    students: {
      parents: [],
      children: [
        { childTable: 'enrollments', childColumn: 'student_no', parentColumn: 'student_no', constraintName: 'fk_enr_student' }
      ]
    },
    enrollments: {
      parents: [
        { sourceColumn: 'student_no', parentTable: 'students', parentColumn: 'student_no', constraintName: 'fk_enr_student' },
        { sourceColumn: 'course_code', parentTable: 'courses', parentColumn: 'code', constraintName: 'fk_enr_course' }
      ],
      children: []
    }
  };

  const relations = mockRelationsMap[tableName] || { parents: [], children: [] };

  return {
    schemaName,
    tableName,
    sampleData,
    createSql,
    indexes,
    relations
  };
}

/**
 * Fetch relations for a single table (Parents and Children)
 */
async function getTableRelations(credentials, schemaName, tableName) {
  if (credentials.isMock) {
    const details = getMockTableDetails(schemaName, tableName);
    return {
      schemaName,
      tableName,
      relations: details.relations || { parents: [], children: [] }
    };
  }

  const config = createConnectionConfig(credentials);
  let connection;

  try {
    connection = await mysql.createConnection(config);

    // 1. Parent tables
    const [parentsRows] = await connection.query(
      `SELECT COLUMN_NAME as sourceColumn, REFERENCED_TABLE_NAME as parentTable, REFERENCED_COLUMN_NAME as parentColumn, CONSTRAINT_NAME as constraintName
       FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
      [schemaName, tableName]
    );

    // 2. Child tables
    const [childrenRows] = await connection.query(
      `SELECT TABLE_NAME as childTable, COLUMN_NAME as childColumn, REFERENCED_COLUMN_NAME as parentColumn, CONSTRAINT_NAME as constraintName
       FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
      [schemaName, tableName]
    );

    await connection.end();

    return {
      schemaName,
      tableName,
      relations: {
        parents: parentsRows.map(r => ({
          sourceColumn: r.sourceColumn,
          parentTable: r.parentTable,
          parentColumn: r.parentColumn,
          constraintName: r.constraintName
        })),
        children: childrenRows.map(r => ({
          childTable: r.childTable,
          childColumn: r.childColumn,
          parentColumn: r.parentColumn,
          constraintName: r.constraintName
        }))
      }
    };
  } catch (error) {
    if (connection) {
      try { await connection.end(); } catch (e) {}
    }
    throw new Error(`Tablo ilişkileri alınamadı: ${error.message}`);
  }
}

/**
 * Get Paginated Table Data
 */
async function getTableData(credentials, schemaName, tableName, page = 1, limit = 25) {
  const safePage = Math.max(1, parseInt(page) || 1);
  const safeLimit = Math.max(1, Math.min(parseInt(limit) || 25, 1000));
  const offset = (safePage - 1) * safeLimit;

  if (credentials && credentials.isMock) {
    const details = getMockTableDetails(schemaName, tableName);
    let sampleData = details.sampleData || [];

    // Expand mock data up to 75 rows if small, for pagination demonstration
    if (sampleData.length > 0 && sampleData.length < 50) {
      const expandedMock = [];
      const totalMockCount = 75;
      for (let i = 0; i < totalMockCount; i++) {
        const baseRow = sampleData[i % sampleData.length];
        const newRow = { ...baseRow };
        if (newRow.id !== undefined) {
          newRow.id = i + 1;
        }
        if (newRow.user_id !== undefined) {
          newRow.user_id = (i % 10) + 1;
        }
        expandedMock.push(newRow);
      }
      sampleData = expandedMock;
    }

    const totalRows = sampleData.length;
    const paginatedRows = sampleData.slice(offset, offset + safeLimit);
    const totalPages = Math.max(1, Math.ceil(totalRows / safeLimit));

    return {
      rows: paginatedRows,
      totalRows,
      page: safePage,
      limit: safeLimit,
      totalPages
    };
  }

  const config = createConnectionConfig(credentials);
  let connection;

  try {
    connection = await mysql.createConnection(config);
    const escapedSchema = mysql.escapeId(schemaName);
    const escapedTable = mysql.escapeId(tableName);
    const fullTableName = `${escapedSchema}.${escapedTable}`;

    let totalRows = 0;
    try {
      const [countResult] = await connection.query(`SELECT COUNT(*) as total FROM ${fullTableName}`);
      if (countResult && countResult.length > 0) {
        totalRows = Number(countResult[0].total) || 0;
      }
    } catch (e) {
      totalRows = 0;
    }

    let rows = [];
    try {
      const [dataRows] = await connection.query(`SELECT * FROM ${fullTableName} LIMIT ? OFFSET ?`, [safeLimit, offset]);
      rows = dataRows;
    } catch (e) {
      rows = [];
    }

    await connection.end();

    const totalPages = Math.max(1, Math.ceil(totalRows / safeLimit));

    return {
      rows,
      totalRows,
      page: safePage,
      limit: safeLimit,
      totalPages
    };
  } catch (error) {
    if (connection) {
      try { await connection.end(); } catch (e) {}
    }
    throw new Error(`Veriler alınamadı: ${error.message}`);
  }
}

/**
 * Execute Arbitrary SQL Query
 */
async function executeQuery(credentials, schemaName, sqlQuery) {
  if (!sqlQuery || typeof sqlQuery !== 'string' || !sqlQuery.trim()) {
    throw new Error('Lütfen çalıştırılacak bir SQL sorgusu girin.');
  }

  const queryTrimmed = sqlQuery.trim();
  const startTime = Date.now();

  if (credentials && credentials.isMock) {
    const executionTimeMs = Date.now() - startTime + 6;
    const lower = queryTrimmed.toLowerCase();

    if (lower.startsWith('select') || lower.startsWith('show') || lower.startsWith('explain') || lower.startsWith('desc')) {
      const fromMatch = queryTrimmed.match(/from\s+[`"]?([a-zA-Z0-9_]+)[`"]?/i);
      const tableName = fromMatch ? fromMatch[1] : 'school';

      const mockDetails = getMockTableDetails(schemaName, tableName);
      let sampleData = mockDetails.sampleData || [
        { id: 1, query_result: 'Demo Sorgu Sonucu 1', status: 'ACTIVE' },
        { id: 2, query_result: 'Demo Sorgu Sonucu 2', status: 'ACTIVE' }
      ];

      return {
        success: true,
        isSelect: true,
        rows: sampleData,
        rowCount: sampleData.length,
        affectedRows: 0,
        executionTimeMs,
        message: `${sampleData.length} kayıt başarıyla getirildi (Demo Modu).`
      };
    } else {
      return {
        success: true,
        isSelect: false,
        rows: [],
        rowCount: 0,
        affectedRows: 1,
        executionTimeMs,
        message: `Sorgu çalıştırıldı. Etkilenen satır: 1 (Demo Modu).`
      };
    }
  }

  const config = createConnectionConfig(credentials);
  let connection;

  try {
    connection = await mysql.createConnection(config);

    if (schemaName) {
      const escapedSchema = mysql.escapeId(schemaName);
      await connection.query(`USE ${escapedSchema}`);
    }

    const [result, fields] = await connection.query(queryTrimmed);
    const executionTimeMs = Date.now() - startTime;
    await connection.end();

    if (Array.isArray(result)) {
      return {
        success: true,
        isSelect: true,
        rows: result,
        rowCount: result.length,
        affectedRows: 0,
        executionTimeMs,
        message: `${result.length} kayıt başarıyla getirildi (${(executionTimeMs / 1000).toFixed(3)} sn).`
      };
    } else {
      return {
        success: true,
        isSelect: false,
        rows: [],
        rowCount: 0,
        affectedRows: result ? (result.affectedRows || 0) : 0,
        insertId: result ? (result.insertId || 0) : 0,
        executionTimeMs,
        message: `Sorgu çalıştırıldı. Etkilenen satır: ${result ? (result.affectedRows || 0) : 0} (${(executionTimeMs / 1000).toFixed(3)} sn).`
      };
    }
  } catch (error) {
    if (connection) {
      try { await connection.end(); } catch (e) {}
    }
    throw new Error(error.message);
  }
}

module.exports = {
  testConnection,
  getSchemaTree,
  getTableDetails,
  getTableRelations,
  getTableData,
  executeQuery
};
