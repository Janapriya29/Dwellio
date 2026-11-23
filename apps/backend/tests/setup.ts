import mongoose from 'mongoose';

/**
 * Strict naming convention for test databases:
 * Must start with "dwellio_test" optionally followed by an underscore and alphanumeric/underscore suffix.
 * Examples: dwellio_test, dwellio_test_booking, dwellio_test_payments_4a
 */
export const TEST_DB_NAME_REGEX = /^dwellio_test(_[a-z0-9_]+)?$/i;

/**
 * Permitted test MongoDB host patterns:
 * Strictly limited to loopback addresses (127.0.0.0/8, localhost, IPv6 ::1).
 */
export const LOOPBACK_HOST_REGEX = /^(127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}|localhost|::1|\[::1\])$/i;

/**
 * Internal state tracking for validated active test connections.
 * Guarantees that clearTestDb and disconnectTestDb (dropDatabase) can ONLY
 * execute on an explicitly validated test connection established through connectTestDb.
 */
let activeValidatedTestDbName: string | null = null;

export const getActiveValidatedTestDbName = (): string | null => activeValidatedTestDbName;

export interface ValidatedTestDbTarget {
  resolvedUri: string;
  dbName: string;
  host: string;
}

/**
 * Validates a test MongoDB target against strict safety rules before connecting.
 * Rejects remote hosts, Atlas/SRV URIs, Docker hosts, production/dev databases, and invalid formats.
 */
export const validateTestDbTarget = (
  rawBaseUri: string = 'mongodb://127.0.0.1:27017',
  targetDbName?: string
): ValidatedTestDbTarget => {
  if (!rawBaseUri || typeof rawBaseUri !== 'string' || rawBaseUri.trim().length === 0) {
    throw new Error('[Database Safety] Test MongoDB URI must be a non-empty string.');
  }

  const trimmedUri = rawBaseUri.trim();

  // 1. Strictly forbid Atlas / SRV connection strings
  if (trimmedUri.startsWith('mongodb+srv://')) {
    throw new Error(
      '[Database Safety] Unsafe MongoDB URI: MongoDB Atlas / SRV connection strings (mongodb+srv://) are strictly prohibited for testing.'
    );
  }

  // 2. Protocol must strictly be mongodb://
  if (!trimmedUri.startsWith('mongodb://')) {
    throw new Error(
      `[Database Safety] Unsafe MongoDB URI scheme. Expected "mongodb://", received: "${trimmedUri.slice(0, 15)}...".`
    );
  }

  const afterScheme = trimmedUri.slice('mongodb://'.length);
  if (!afterScheme || afterScheme.trim().length === 0) {
    throw new Error('[Database Safety] Unsafe MongoDB URI: Missing host and database specification.');
  }

  // 3. Strip credentials if present (user:pass@host)
  const withoutCreds = afterScheme.includes('@') ? afterScheme.split('@')[1] : afterScheme;

  // 4. Parse host part vs path/query
  const slashIdx = withoutCreds.indexOf('/');
  const questionIdx = withoutCreds.indexOf('?');

  let hostPart = withoutCreds;
  let pathPart = '';
  let queryPart = '';

  if (slashIdx !== -1) {
    hostPart = withoutCreds.slice(0, slashIdx);
    const rest = withoutCreds.slice(slashIdx + 1);
    const restQ = rest.indexOf('?');
    if (restQ !== -1) {
      pathPart = rest.slice(0, restQ);
      queryPart = rest.slice(restQ);
    } else {
      pathPart = rest;
    }
  } else if (questionIdx !== -1) {
    hostPart = withoutCreds.slice(0, questionIdx);
    queryPart = withoutCreds.slice(questionIdx);
  }

  if (!hostPart || hostPart.trim().length === 0) {
    throw new Error('[Database Safety] Unsafe MongoDB URI: Host component is missing.');
  }

  // 5. Validate that EVERY host in the URI is a permitted loopback host
  const hosts = hostPart.split(',');
  for (const h of hosts) {
    const trimmedH = h.trim();
    if (!trimmedH) {
      throw new Error('[Database Safety] Unsafe MongoDB URI: Empty host component in host list.');
    }

    let hostname = trimmedH;
    if (hostname.startsWith('[')) {
      const closingBracket = hostname.indexOf(']');
      if (closingBracket !== -1) {
        hostname = hostname.slice(0, closingBracket + 1);
      }
    } else if (hostname.includes(':')) {
      hostname = hostname.split(':')[0];
    }

    if (!LOOPBACK_HOST_REGEX.test(hostname)) {
      throw new Error(
        `[Database Safety] Unsafe MongoDB host "${hostname}". Only loopback hosts (127.0.0.1, localhost) are permitted for testing. Remote clusters, Atlas, and Docker service hosts (e.g. "mongodb") are rejected.`
      );
    }
  }

  // 6. If URI itself contains a path database name, validate it against naming convention
  if (pathPart) {
    const uriDbName = pathPart.trim();
    if (uriDbName && !TEST_DB_NAME_REGEX.test(uriDbName)) {
      throw new Error(
        `[Database Safety] Unsafe database name in URI "${uriDbName}". Test databases must strictly match convention /^dwellio_test(_[a-z0-9_]+)?$/i. Development ("dwellio") and production databases are rejected.`
      );
    }
  }

  // 7. Resolve effective database name: explicit argument takes precedence, then URI path, then default
  const effectiveDbName = targetDbName && targetDbName.trim().length > 0
    ? targetDbName.trim()
    : pathPart.trim() || 'dwellio_test';

  if (!TEST_DB_NAME_REGEX.test(effectiveDbName)) {
    throw new Error(
      `[Database Safety] Unsafe test database name "${effectiveDbName}". Test databases must strictly match convention /^dwellio_test(_[a-z0-9_]+)?$/i. Development ("dwellio") and production databases are rejected.`
    );
  }

  const resolvedUri = `mongodb://${hostPart}/${effectiveDbName}${queryPart}`;

  return {
    resolvedUri,
    dbName: effectiveDbName,
    host: hostPart,
  };
};

/**
 * Connects to an isolated, safety-validated test database on local loopback.
 */
export const connectTestDb = async (dbName: string = 'dwellio_test'): Promise<void> => {
  // Disconnect existing connection and reset state
  activeValidatedTestDbName = null;
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }

  // Validate effective test URI and database name
  const envUri = process.env.MONGO_URI_TEST;
  const effectiveBaseUri = (envUri && envUri !== 'undefined' && envUri.trim().length > 0)
    ? envUri.trim()
    : 'mongodb://127.0.0.1:27017';
  const { resolvedUri, dbName: validatedDbName } = validateTestDbTarget(effectiveBaseUri, dbName);

  await mongoose.connect(resolvedUri);

  // Verify that the actual connected database matches the validated target
  const actualDbName = mongoose.connection.db?.databaseName;
  if (!actualDbName || actualDbName !== validatedDbName || !TEST_DB_NAME_REGEX.test(actualDbName)) {
    activeValidatedTestDbName = null;
    await mongoose.connection.close();
    throw new Error(
      `[Database Safety] Post-connection database mismatch. Expected "${validatedDbName}", connected to "${actualDbName}". Connection aborted.`
    );
  }

  // Mark connection as validated and authorized for test operations
  activeValidatedTestDbName = actualDbName;
};

/**
 * Clears collections in the active test database.
 * Strictly protected: Refuses to clear collections if the active database was not validated.
 */
export const clearTestDb = async (): Promise<void> => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    const currentDbName = mongoose.connection.db.databaseName;

    // Safety guard: Must match active validated test DB and test regex
    if (
      !activeValidatedTestDbName ||
      currentDbName !== activeValidatedTestDbName ||
      !TEST_DB_NAME_REGEX.test(currentDbName)
    ) {
      throw new Error(
        `[Database Safety] Refusing to clear collections: database "${currentDbName}" has not been validated as an authorized test database.`
      );
    }

    const collections = await mongoose.connection.db.collections();
    for (const collection of collections) {
      await collection.deleteMany({});
    }
  }
};

/**
 * Drops the active test database and closes connection.
 * Strictly protected: Refuses to execute dropDatabase if the active database was not validated.
 */
export const disconnectTestDb = async (): Promise<void> => {
  if (mongoose.connection.readyState !== 0) {
    if (mongoose.connection.db) {
      const currentDbName = mongoose.connection.db.databaseName;

      // Safety guard: dropDatabase only if validated test database
      if (
        activeValidatedTestDbName &&
        currentDbName === activeValidatedTestDbName &&
        TEST_DB_NAME_REGEX.test(currentDbName)
      ) {
        await mongoose.connection.db.dropDatabase();
      }
    }

    activeValidatedTestDbName = null;
    await mongoose.connection.close();
  }
};
